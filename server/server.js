const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { MercadoPagoConfig, Payment, Preference } = require('mercadopago');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 1. INICIALIZAÇÃO DO FIREBASE
let db = null;

try {
  let serviceAccount;
  
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    console.log('☁️ Firebase: Lendo credenciais da Variável de Ambiente (Render)');
  } else {
    serviceAccount = require('./serviceAccountKey.json');
    console.log('💻 Firebase: Lendo credenciais do arquivo local');
  }

  initializeApp({
    credential: cert(serviceAccount)
  });
  
  db = getFirestore();
  console.log('✅ Firebase Firestore conectado com sucesso!');
} catch (err) {
  console.error('❌ ERRO CRÍTICO: Não foi possível conectar ao Firebase.', err.message);
}

// 2. INICIALIZAÇÃO DO MERCADO PAGO
const accessTokenEnv = process.env.MERCADOPAGO_ACCESS_TOKEN ? process.env.MERCADOPAGO_ACCESS_TOKEN.trim() : '';
const client = new MercadoPagoConfig({
  accessToken: accessTokenEnv || 'TEST-0000000000000000-000000-00000000000000000000000000000000-000000000',
  options: { timeout: 10000 }
});
const paymentClient = new Payment(client);
const preferenceClient = new Preference(client);

// VALIDAÇÃO DE CPF (MÓDULO 11)
function isValidCPF(cpf) {
    if (typeof cpf !== 'string') return false;
    cpf = cpf.replace(/[^\d]+/g, '');
    if (cpf.length !== 11 || !!cpf.match(/(\d)\1{10}/)) return false;
    const cpfNumbers = cpf.split('').map(el => +el);
    const rest = (count) => (cpfNumbers.slice(0, count - 12).reduce((soma, el, index) => (soma + el * (count - index)), 0) * 10) % 11 % 10;
    return rest(10) === cpfNumbers[9] && rest(11) === cpfNumbers[10];
}

// FUNÇÃO DE VALIDAÇÃO DUPLA DE ESTOQUE E PREÇO OFICIAL DO BANCO
async function validateAndSanitizeItems(requestedItems) {
    if (!db) throw new Error("Banco de dados indisponível.");
    if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
        return { valid: false, error: "O carrinho está vazio ou em formato inválido." };
    }
    
    const docRef = db.collection('malala_store').doc('catalog');
    const docSnap = await docRef.get();
    
    if (!docSnap.exists || !docSnap.data().products) {
        throw new Error("Catálogo não encontrado na nuvem.");
    }
    
    const catalog = docSnap.data().products;
    const sanitizedItems = [];
    
    for (let item of requestedItems) {
        const qty = parseInt(item.quantity, 10);
        if (isNaN(qty) || qty < 1) {
            return { valid: false, error: `Quantidade inválida para o item "${item.title || item.id}".` };
        }

        const productInDb = catalog.find(p => String(p.id) === String(item.id));
        if (!productInDb) {
            return { valid: false, error: `Produto "${item.title || item.id}" não existe mais no catálogo.` };
        }
        if (productInDb.stock < qty) {
            return { 
                valid: false, 
                error: `O produto "${productInDb.title}" esgotou ou não tem a quantidade solicitada (Estoque disponível: ${productInDb.stock}).` 
            };
        }

        const officialPrice = Number(parseFloat(productInDb.price).toFixed(2));
        if (isNaN(officialPrice) || officialPrice <= 0) {
            return {
                valid: false,
                error: `O produto "${productInDb.title}" está sob consulta e não pode ser finalizado diretamente pelo checkout.`
            };
        }

        sanitizedItems.push({
            id: String(productInDb.id),
            title: String(productInDb.title),
            quantity: qty,
            price: officialPrice
        });
    }
    return { valid: true, sanitizedItems };
}

// HELPERS PARA META CONVERSIONS API (CAPI) E FEED XML DE CATÁLOGO
const STORE_BASE_URL = (process.env.STORE_BASE_URL || 'https://www.malalastore.com.br').replace(/\/+$/, '');

function sha256Normalized(value) {
  if (!value) return undefined;
  const clean = String(value).trim().toLowerCase();
  if (!clean) return undefined;
  return crypto.createHash('sha256').update(clean).digest('hex');
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractTrackingMeta(req) {
  const incoming = (req.body && req.body.tracking) || {};
  const forwardedFor = req.headers['x-forwarded-for'];
  const clientIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : req.ip || '');

  return {
    fbp: typeof incoming.fbp === 'string' ? incoming.fbp.trim() : '',
    fbc: typeof incoming.fbc === 'string' ? incoming.fbc.trim() : '',
    eventSourceUrl: typeof incoming.eventSourceUrl === 'string' && incoming.eventSourceUrl.startsWith('http')
      ? incoming.eventSourceUrl.trim()
      : `${STORE_BASE_URL}/`,
    clientIp: clientIp || '',
    userAgent: req.get('user-agent') || ''
  };
}

async function sendMetaCapiPurchase(orderId, orderData) {
  const pixelId = (process.env.META_PIXEL_ID || '').trim();
  const accessToken = (process.env.META_CAPI_ACCESS_TOKEN || '').trim();
  if (!pixelId || !accessToken) return;

  try {
    const payer = orderData.payer || {};
    const address = payer.address || {};
    const tracking = orderData.tracking || {};
    const nameParts = String(payer.name || '').trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ');
    const cityOnly = String(address.city || '').split('/')[0].trim();
    const cepDigits = String(address.cep || '').replace(/\D/g, '');
    const rawPhoneDigits = String(payer.phone || '').replace(/\D/g, '');
    const normalizedPhone = rawPhoneDigits
      ? (rawPhoneDigits.startsWith('55') ? rawPhoneDigits : `55${rawPhoneDigits}`)
      : '';

    const userData = {};
    const emHash = sha256Normalized(payer.email);
    const phHash = sha256Normalized(normalizedPhone);
    const fnHash = sha256Normalized(firstName);
    const lnHash = sha256Normalized(lastName);
    const zpHash = sha256Normalized(cepDigits);
    const ctHash = sha256Normalized(cityOnly);
    const countryHash = sha256Normalized('br');

    if (emHash) userData.em = [emHash];
    if (phHash) userData.ph = [phHash];
    if (fnHash) userData.fn = [fnHash];
    if (lnHash) userData.ln = [lnHash];
    if (zpHash) userData.zp = [zpHash];
    if (ctHash) userData.ct = [ctHash];
    if (countryHash) userData.country = [countryHash];
    if (tracking.fbp) userData.fbp = tracking.fbp;
    if (tracking.fbc) userData.fbc = tracking.fbc;
    if (tracking.clientIp) userData.client_ip_address = tracking.clientIp;
    if (tracking.userAgent) userData.client_user_agent = tracking.userAgent;

    const items = Array.isArray(orderData.items) ? orderData.items : [];
    const totalAmount = Number(orderData.totalAmount || 0);
    const numItems = items.reduce((acc, i) => acc + Number(i.quantity || 1), 0);

    const payload = {
      data: [
        {
          event_name: 'Purchase',
          event_time: Math.floor(Date.now() / 1000),
          event_id: String(orderId), // Mesmo eventID do Pixel no frontend para deduplicação oficial
          action_source: 'website',
          event_source_url: tracking.eventSourceUrl || `${STORE_BASE_URL}/`,
          user_data: userData,
          custom_data: {
            currency: 'BRL',
            value: Number(totalAmount.toFixed(2)),
            order_id: String(orderId),
            content_type: 'product',
            content_ids: items.map(i => String(i.id)),
            contents: items.map(i => ({
              id: String(i.id),
              quantity: Number(i.quantity || 1),
              item_price: Number(i.price || 0)
            })),
            num_items: numItems
          }
        }
      ]
    };

    const testEventCode = (process.env.META_TEST_EVENT_CODE || '').trim();
    if (testEventCode) {
      payload.test_event_code = testEventCode;
    }

    const capiRes = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    if (capiRes.ok) {
      console.log(`📡 [META CAPI] Purchase enviado com sucesso para o pedido ${orderId}`);
    } else {
      const errBody = await capiRes.text();
      console.error(`❌ [META CAPI] Falha ao enviar Purchase (${orderId}):`, errBody);
    }
  } catch (err) {
    console.error('❌ [META CAPI] Erro inesperado:', err);
  }
}

// ROTA 1: PIX
app.post('/api/payments/pix', async (req, res) => {
  try {
    const { items, payer, shippingAddress } = req.body;
    if (!db) return res.status(500).json({ error: 'Erro interno: Banco de dados desconectado.' });

    if (!payer || !payer.email || !payer.first_name || !payer.identification || !isValidCPF(payer.identification.number)) {
      return res.status(400).json({ error: 'Dados do comprador ou CPF inválidos.' });
    }

    const stockValidation = await validateAndSanitizeItems(items);
    if (!stockValidation.valid) {
        return res.status(409).json({ error: stockValidation.error });
    }

    const officialItems = stockValidation.sanitizedItems;
    const totalAmount = Number(officialItems.reduce((acc, item) => acc + (item.price * item.quantity), 0).toFixed(2));
    const cleanEmail = String(payer.email).trim().toLowerCase();
    const cleanCpf = String(payer.identification.number).replace(/\D/g, '');
    const cleanPhone = payer.phone ? String(payer.phone).trim() : '';
    const trackingMeta = extractTrackingMeta(req);
    let orderId = 'ORD-' + Date.now();

    try {
      const orderRef = await db.collection('orders').add({
        payer: {
          name: `${String(payer.first_name).trim()} ${String(payer.last_name || '').trim()}`.trim(),
          email: cleanEmail,
          phone: cleanPhone,
          cpf: cleanCpf,
          address: payer.address || shippingAddress || null
        },
        items: officialItems,
        totalAmount,
        paymentMethod: 'pix',
        tracking: trackingMeta,
        status: 'Pendente',
        createdAt: FieldValue.serverTimestamp()
      });
      orderId = orderRef.id;
    } catch (dbError) {
      return res.status(500).json({ error: 'Falha ao registrar pedido no banco de dados.' });
    }

    const backendUrl = process.env.RENDER_EXTERNAL_URL || `https://${req.get('host')}`;
    
    const paymentData = {
      body: {
        transaction_amount: totalAmount,
        description: `Pedido Malala Store #${orderId}`,
        payment_method_id: 'pix',
        payer: {
          email: cleanEmail,
          first_name: String(payer.first_name).trim(),
          last_name: String(payer.last_name || 'Cliente').trim(),
          identification: {
            type: 'CPF',
            number: cleanCpf
          }
        },
        external_reference: orderId,
        notification_url: `${backendUrl}/api/webhooks/mercadopago`
      }
    };

    const paymentResponse = await paymentClient.create(paymentData);
    const pixInfo = paymentResponse.point_of_interaction.transaction_data;

    await db.collection('orders').doc(orderId).update({
      mercadoPagoId: paymentResponse.id,
      pixQrCodeBase64: pixInfo.qr_code_base64,
      pixCopyPaste: pixInfo.qr_code
    });

    res.status(200).json({
      success: true,
      orderId: orderId,
      qrCodeBase64: pixInfo.qr_code_base64,
      qrCodeCopyPaste: pixInfo.qr_code
    });

  } catch (error) {
    console.error('❌ Erro geral na rota PIX:', error);
    res.status(500).json({ error: 'Falha ao processar o pagamento via PIX.' });
  }
});

// ROTA 2: CHECKOUT PRO (MERCADO PAGO)
app.post('/api/payments/checkout-pro', async (req, res) => {
  try {
    const { items, payer, shippingAddress } = req.body;
    if (!db) return res.status(500).json({ error: 'Erro interno: Banco de dados desconectado.' });

    if (!payer || !payer.email || !payer.first_name || !payer.identification || !isValidCPF(payer.identification.number)) {
      return res.status(400).json({ error: 'Dados do comprador ou CPF inválidos.' });
    }

    const stockValidation = await validateAndSanitizeItems(items);
    if (!stockValidation.valid) {
        return res.status(409).json({ error: stockValidation.error });
    }

    const officialItems = stockValidation.sanitizedItems;
    const totalAmount = Number(officialItems.reduce((acc, item) => acc + (item.price * item.quantity), 0).toFixed(2));
    const cleanEmail = String(payer.email).trim().toLowerCase();
    const cleanCpf = String(payer.identification.number).replace(/\D/g, '');
    const cleanPhone = payer.phone ? String(payer.phone).trim() : '';
    const trackingMeta = extractTrackingMeta(req);
    let orderId = 'ORD-' + Date.now();

    try {
      const orderRef = await db.collection('orders').add({
        payer: {
          name: `${String(payer.first_name).trim()} ${String(payer.last_name || '').trim()}`.trim(),
          email: cleanEmail,
          phone: cleanPhone,
          cpf: cleanCpf,
          address: payer.address || shippingAddress || null
        },
        items: officialItems,
        totalAmount,
        paymentMethod: 'mercado_pago_pro',
        tracking: trackingMeta,
        status: 'Pendente',
        createdAt: FieldValue.serverTimestamp()
      });
      orderId = orderRef.id;
    } catch (dbError) {
      return res.status(500).json({ error: 'Falha ao registrar pedido no banco de dados.' });
    }

    const backendUrl = process.env.RENDER_EXTERNAL_URL || `https://${req.get('host')}`;

    const preferenceItems = officialItems.map(item => ({
      id: String(item.id),
      title: item.title,
      quantity: item.quantity,
      unit_price: item.price
    }));

    const preferenceData = {
      body: {
        items: preferenceItems,
        payer: {
          name: String(payer.first_name).trim(),
          surname: String(payer.last_name || 'Cliente').trim(),
          email: cleanEmail,
          identification: {
            type: 'CPF',
            number: cleanCpf
          }
        },
        back_urls: {
          success: `https://www.malalastore.com.br/minha-conta.html`,
          failure: `https://www.malalastore.com.br/index.html`,
          pending: `https://www.malalastore.com.br/minha-conta.html`
        },
        auto_return: 'approved',
        external_reference: orderId,
        notification_url: `${backendUrl}/api/webhooks/mercadopago`,
        payment_methods: {
          excluded_payment_methods: [],
          excluded_payment_types: [{ id: "ticket" }],
          installments: 10
        }
      }
    };

    const preferenceResponse = await preferenceClient.create(preferenceData);

    await db.collection('orders').doc(orderId).update({
      mercadoPagoPreferenceId: preferenceResponse.id,
      initPoint: preferenceResponse.init_point
    });

    res.status(200).json({
      success: true,
      orderId: orderId,
      init_point: preferenceResponse.init_point
    });

  } catch (error) {
    console.error('❌ Erro geral na rota de Checkout Pro:', error);
    res.status(500).json({ error: 'Falha ao criar preferência de pagamento.' });
  }
});

// ROTA DE HEALTHCHECK (RENDER / MONITORAMENTO)
app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, db: Boolean(db) });
});

// ROTA DE FEED XML DO CATÁLOGO (META COMMERCE MANAGER / GOOGLE MERCHANT CENTER)
app.get('/api/catalog/feed.xml', async (req, res) => {
  try {
    if (!db) return res.status(500).type('text/plain').send('Banco de dados indisponível.');

    const docSnap = await db.collection('malala_store').doc('catalog').get();
    const rawProducts = docSnap.exists && Array.isArray(docSnap.data().products)
      ? docSnap.data().products
      : [];

    const validProducts = rawProducts.filter(p => {
      const price = Number(parseFloat(p.price));
      return p && p.id !== undefined && p.title && p.image && Number.isFinite(price) && price > 0 && p.status !== 'consulte';
    });

    const itemsXml = validProducts.map(p => {
      const id = String(p.id);
      const title = String(p.title).trim();
      const rawDesc = String(p.description || p.desc || p.descricao || '').trim();
      const description = rawDesc && rawDesc !== '.' && rawDesc !== 'Produto recém-adicionado.'
        ? rawDesc
        : `${title} original com garantia de procedência Malala Store.`;
      const price = Number(parseFloat(p.price)).toFixed(2);
      const inStock = (p.stock === undefined || Number(p.stock) > 0) && p.status !== 'esgotado';
      const availability = inStock ? 'in stock' : 'out of stock';
      const productLink = `${STORE_BASE_URL}/?produto=${encodeURIComponent(id)}`;
      const category = String(p.subcategory || p.category || 'Produtos').trim();
      const brand = String(p.brand || 'Malala Store').trim();
      const extraImages = Array.isArray(p.images)
        ? p.images
            .filter(img => typeof img === 'string' && img.trim().startsWith('http'))
            .slice(0, 10)
            .map(img => `      <g:additional_image_link>${escapeXml(img.trim())}</g:additional_image_link>`)
            .join('\n')
        : '';

      return [
        '    <item>',
        `      <g:id>${escapeXml(id)}</g:id>`,
        `      <g:title>${escapeXml(title)}</g:title>`,
        `      <g:description>${escapeXml(description)}</g:description>`,
        `      <g:link>${escapeXml(productLink)}</g:link>`,
        `      <g:image_link>${escapeXml(String(p.image).trim())}</g:image_link>`,
        extraImages,
        `      <g:availability>${availability}</g:availability>`,
        `      <g:price>${price} BRL</g:price>`,
        '      <g:condition>new</g:condition>',
        `      <g:brand>${escapeXml(brand)}</g:brand>`,
        `      <g:product_type>${escapeXml(category)}</g:product_type>`,
        '    </item>'
      ].filter(Boolean).join('\n');
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n    <title>MALALA STORE - Catálogo Oficial</title>\n    <link>${escapeXml(STORE_BASE_URL)}/</link>\n    <description>Tecnologia, Beleza e Perfumaria Importada e Árabe.</description>\n${itemsXml}\n  </channel>\n</rss>\n`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.status(200).send(xml);
  } catch (error) {
    console.error('❌ Erro ao gerar feed XML do catálogo:', error);
    res.status(500).type('text/plain').send('Falha ao gerar feed XML.');
  }
});

// ROTA DE STATUS DO PEDIDO (POLLING PARA PIX E CONFIRMAÇÃO DE PURCHASE)
app.get('/api/orders/:id/status', async (req, res) => {
  try {
    const orderId = req.params.id;
    if (!db) return res.status(500).json({ error: 'Erro interno: Banco de dados desconectado.' });

    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const orderData = orderSnap.data();
    const responsePayload = { status: orderData.status };

    // Retorna apenas dados não-sensíveis (sem PII) quando o pedido está Pago para rastreamento de Purchase
    if (orderData.status === 'Pago') {
      responsePayload.totalAmount = Number(orderData.totalAmount || 0);
      responsePayload.paymentMethod = orderData.paymentMethod || 'mercadopago';
      responsePayload.items = (orderData.items || []).map(item => ({
        id: String(item.id),
        title: String(item.title),
        quantity: Number(item.quantity || 1),
        price: Number(item.price || 0)
      }));
    }

    res.status(200).json(responsePayload);
  } catch (error) {
    console.error('❌ Erro ao buscar status do pedido:', error);
    res.status(500).json({ error: 'Falha ao buscar status do pedido.' });
  }
});

// ROTA 3: WEBHOOK MERCADO PAGO
app.post('/api/webhooks/mercadopago', async (req, res) => {
  res.status(200).send('OK');

  try {
    const { type, data } = req.body;
    const paymentId = (data && data.id) || req.query['data.id'];
    const topic = type || req.query.type || req.query.topic;
    
    if ((topic === 'payment' || topic === 'payment.updated' || topic === 'payment.created') && paymentId) {
      const paymentInfo = await paymentClient.get({ id: paymentId });
      
      const orderId = paymentInfo.external_reference;
      const status = paymentInfo.status;

      if (!orderId || !db) return;

      const orderRef = db.collection('orders').doc(orderId);
      const catalogRef = db.collection('malala_store').doc('catalog');

      if (status === 'approved') {
        let orderJustApproved = null;

        await db.runTransaction(async (transaction) => {
          const orderSnap = await transaction.get(orderRef);
          if (!orderSnap.exists) return;

          const orderData = orderSnap.data();
          if (orderData.status === 'Pago') {
            return; // Idempotência: evita desconto duplicado de estoque
          }

          const catalogSnap = await transaction.get(catalogRef);
          if (catalogSnap.exists && catalogSnap.data().products) {
            let catProducts = catalogSnap.data().products;
            let changed = false;

            (orderData.items || []).forEach(item => {
              const p = catProducts.find(x => String(x.id) === String(item.id));
              if (p && p.stock !== undefined) {
                p.stock = Math.max(0, p.stock - (item.quantity || 1));
                changed = true;
              }
            });

            if (changed) {
              transaction.update(catalogRef, {
                products: catProducts,
                updatedAt: FieldValue.serverTimestamp()
              });
            }
          }

          transaction.update(orderRef, {
            status: 'Pago',
            updatedAt: FieldValue.serverTimestamp()
          });

          orderJustApproved = orderData;
        });

        if (orderJustApproved) {
          console.log(`✅ [WEBHOOK] Pedido ${orderId} aprovado e estoque reduzido com sucesso!`);

          // Enviar evento Purchase via Meta Conversions API (CAPI) com deduplicação por event_id
          await sendMetaCapiPurchase(orderId, orderJustApproved);

          // Enviar email de confirmação via EmailJS
          try {
            const payerEmail = orderJustApproved.payer.email;
            const orderSummaryText = (orderJustApproved.items || []).map(i => `${i.quantity || i.qty}x ${i.title}`).join(', ');
            const emailjsPrivateKey = process.env.EMAILJS_PRIVATE_KEY;

            if (!emailjsPrivateKey) {
              console.warn('⚠️ [EMAIL] EMAILJS_PRIVATE_KEY não configurada nas variáveis de ambiente.');
            } else {
              const emailjsPayload = {
                service_id: process.env.EMAILJS_SERVICE_ID || 'service_fvb6yhg',
                template_id: process.env.EMAILJS_TEMPLATE_ID || 'template_n10dl83',
                user_id: process.env.EMAILJS_PUBLIC_KEY || 'vI8slPfRAcF3rOg0P',
                accessToken: emailjsPrivateKey,
                template_params: {
                  email: payerEmail,
                  order_id: orderId,
                  order_summary: orderSummaryText
                }
              };

              const emailjsRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(emailjsPayload)
              });

              if (emailjsRes.ok) {
                console.log(`✉️ [EMAIL] Confirmação enviada para ${payerEmail}`);
              } else {
                const errText = await emailjsRes.text();
                console.error(`❌ [EMAIL] Falha ao enviar para ${payerEmail}:`, errText);
              }
            }
          } catch (emailErr) {
            console.error('❌ Erro na chamada ao EmailJS:', emailErr);
          }
        }
      } else if (status === 'cancelled' || status === 'rejected') {
        const orderSnap = await orderRef.get();
        if (orderSnap.exists && orderSnap.data().status !== 'Pago') {
          await orderRef.update({
            status: 'Cancelado',
            updatedAt: FieldValue.serverTimestamp()
          });
        }
      }
    }
  } catch (error) {
    console.error('❌ Erro no processamento do Webhook:', error);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor Malala Store rodando na porta ${PORT}`);
});
