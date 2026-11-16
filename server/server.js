const express = require('express');
const cors = require('cors');
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
    let orderId = 'ORD-' + Date.now();

    try {
      const orderRef = await db.collection('orders').add({
        payer: {
          name: `${String(payer.first_name).trim()} ${String(payer.last_name || '').trim()}`.trim(),
          email: cleanEmail,
          cpf: cleanCpf,
          address: payer.address || shippingAddress || null
        },
        items: officialItems,
        totalAmount,
        paymentMethod: 'pix',
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
    let orderId = 'ORD-' + Date.now();

    try {
      const orderRef = await db.collection('orders').add({
        payer: {
          name: `${String(payer.first_name).trim()} ${String(payer.last_name || '').trim()}`.trim(),
          email: cleanEmail,
          cpf: cleanCpf,
          address: payer.address || shippingAddress || null
        },
        items: officialItems,
        totalAmount,
        paymentMethod: 'mercado_pago_pro',
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

// ROTA DE STATUS DO PEDIDO (POLLING PARA PIX)
app.get('/api/orders/:id/status', async (req, res) => {
  try {
    const orderId = req.params.id;
    if (!db) return res.status(500).json({ error: 'Erro interno: Banco de dados desconectado.' });

    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    res.status(200).json({ status: orderSnap.data().status });
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
