const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
const { MercadoPagoConfig, Payment } = require('mercadopago');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// 1. INICIALIZAÇÃO DO FIREBASE ADMIN SDK
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin SDK inicializado.');
  } catch (err) {
    console.error('❌ Erro ao parsear FIREBASE_SERVICE_ACCOUNT:', err.message);
  }
} else {
  // Inicialização padrão para ambiente Firebase Cloud Functions ou Google Cloud
  try {
    admin.initializeApp();
    console.log('✅ Firebase Admin SDK inicializado (padrão Google Cloud).');
  } catch (e) {
    console.warn('⚠️ Firebase Admin rodando em modo sem credenciais. Configure FIREBASE_SERVICE_ACCOUNT no .env.');
  }
}

const db = admin.apps.length ? admin.firestore() : null;

// 2. INICIALIZAÇÃO DO MERCADO PAGO SDK
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || 'TEST-0000000000000000-000000-00000000000000000000000000000000-000000000'
});

const paymentClient = new Payment(client);

// MIDDLEWARE DE AUTENTICAÇÃO DO USUÁRIO (OPCIONAL/MANDATÓRIO CONFORME ROTA)
async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    if (admin.apps.length) {
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = decodedToken;
    } else {
      req.user = { uid: 'guest_user' };
    }
    next();
  } catch (error) {
    console.error('Erro na verificação do token Firebase:', error);
    return res.status(401).json({ error: 'Sessão inválida ou token expirado.' });
  }
}

// ROTA 1: CRIAR PAGAMENTO VIA PIX
app.post('/api/payments/pix', authenticateUser, async (req, res) => {
  try {
    const { items, payer, shippingAddress } = req.body;

    if (!items || !items.length || !payer || !payer.email || !payer.identification) {
      return res.status(400).json({ error: 'Dados insuficientes para gerar o PIX (items e dados do pagador são obrigatórios).' });
    }

    const totalAmount = items.reduce((acc, item) => acc + (parseFloat(item.price) * parseInt(item.quantity)), 0);

    // Salva pedido prévio no Firestore com status 'Pendente'
    let orderId = 'ORD-' + Date.now();
    if (db) {
      const orderRef = await db.collection('orders').add({
        userId: req.user ? req.user.uid : 'guest',
        payer: {
          name: payer.first_name + ' ' + (payer.last_name || ''),
          email: payer.email,
          cpf: payer.identification.number
        },
        items,
        totalAmount,
        paymentMethod: 'pix',
        status: 'Pendente',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      orderId = orderRef.id;
    }

    // Configuração do pagamento via PIX no Mercado Pago
    const paymentData = {
      body: {
        transaction_amount: Number(totalAmount.toFixed(2)),
        description: `Pedido Malala Store #${orderId}`,
        payment_method_id: 'pix',
        payer: {
          email: payer.email,
          first_name: payer.first_name,
          last_name: payer.last_name || 'Cliente',
          identification: {
            type: payer.identification.type || 'CPF',
            number: payer.identification.number
          }
        },
        external_reference: orderId,
        notification_url: process.env.MERCADOPAGO_WEBHOOK_URL || 'https://seu-dominio.com/api/payments/webhook'
      }
    };

    const paymentResponse = await paymentClient.create(paymentData);

    const pixInfo = paymentResponse.point_of_interaction.transaction_data;

    // Atualiza pedido no Firestore com dados do PIX
    if (db && orderId) {
      await db.collection('orders').doc(orderId).update({
        mercadoPagoId: paymentResponse.id,
        pixQrCodeBase64: pixInfo.qr_code_base64,
        pixCopyPaste: pixInfo.qr_code,
        pixTicketUrl: pixInfo.ticket_url
      });
    }

    res.status(200).json({
      success: true,
      orderId: orderId,
      paymentId: paymentResponse.id,
      status: paymentResponse.status,
      qrCodeBase64: pixInfo.qr_code_base64,
      qrCodeCopyPaste: pixInfo.qr_code,
      ticketUrl: pixInfo.ticket_url,
      totalAmount: totalAmount
    });

  } catch (error) {
    console.error('❌ Erro ao gerar PIX no Mercado Pago:', error);
    res.status(500).json({
      error: 'Falha ao processar o pagamento via PIX.',
      details: error.message || error
    });
  }
});

// ROTA 2: PROCESSAR CARTÃO DE CRÉDITO (CHECKOUT TRANSPARENTE)
app.post('/api/payments/card', authenticateUser, async (req, res) => {
  try {
    const { token, issuer_id, payment_method_id, installments, payer, items } = req.body;

    if (!token || !payment_method_id || !payer || !payer.email) {
      return res.status(400).json({ error: 'Dados do cartão de crédito ou do pagador incompletos.' });
    }

    const totalAmount = items.reduce((acc, item) => acc + (parseFloat(item.price) * parseInt(item.quantity)), 0);

    let orderId = 'ORD-' + Date.now();
    if (db) {
      const orderRef = await db.collection('orders').add({
        userId: req.user ? req.user.uid : 'guest',
        payer: {
          name: payer.first_name + ' ' + (payer.last_name || ''),
          email: payer.email,
          cpf: payer.identification ? payer.identification.number : ''
        },
        items,
        totalAmount,
        paymentMethod: 'credit_card',
        installments: parseInt(installments) || 1,
        status: 'Processando',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      orderId = orderRef.id;
    }

    const paymentData = {
      body: {
        token,
        issuer_id,
        payment_method_id,
        transaction_amount: Number(totalAmount.toFixed(2)),
        installments: Number(installments) || 1,
        description: `Pedido Malala Store #${orderId}`,
        payer: {
          email: payer.email,
          identification: {
            type: payer.identification ? payer.identification.type : 'CPF',
            number: payer.identification ? payer.identification.number : ''
          }
        },
        external_reference: orderId,
        notification_url: process.env.MERCADOPAGO_WEBHOOK_URL || 'https://seu-dominio.com/api/payments/webhook'
      }
    };

    const paymentResponse = await paymentClient.create(paymentData);

    const isApproved = paymentResponse.status === 'approved';
    const statusText = isApproved ? 'Pago' : (paymentResponse.status === 'in_process' ? 'Processando' : 'Recusado');

    if (db && orderId) {
      await db.collection('orders').doc(orderId).update({
        mercadoPagoId: paymentResponse.id,
        status: statusText,
        statusDetail: paymentResponse.status_detail
      });
    }

    res.status(200).json({
      success: isApproved,
      orderId: orderId,
      paymentId: paymentResponse.id,
      status: paymentResponse.status,
      statusDetail: paymentResponse.status_detail
    });

  } catch (error) {
    console.error('❌ Erro ao processar Cartão de Crédito:', error);
    res.status(500).json({
      error: 'Erro ao autorizar pagamento no cartão.',
      details: error.message || error
    });
  }
});

// ROTA 3: WEBHOOK DE NOTIFICAÇÃO DO MERCADO PAGO
app.post('/api/payments/webhook', async (req, res) => {
  try {
    const { type, action, data } = req.body;
    const topic = type || req.query.topic || req.query.type;
    const paymentId = (data && data.id) || req.query['data.id'] || req.query.id;

    console.log(`🔔 Webhook Mercado Pago Recebido - Tópico: ${topic}, PaymentID: ${paymentId}`);

    if ((topic === 'payment' || action === 'payment.created' || action === 'payment.updated') && paymentId) {
      // Consulta os detalhes atualizados do pagamento no Mercado Pago
      const paymentInfo = await paymentClient.get({ id: paymentId });
      const orderId = paymentInfo.external_reference;
      const paymentStatus = paymentInfo.status;

      console.log(`ℹ️ Status do Pagamento #${paymentId} (Pedido: ${orderId}): ${paymentStatus}`);

      if (db && orderId) {
        let mappedStatus = 'Pendente';
        if (paymentStatus === 'approved') mappedStatus = 'Pago';
        if (paymentStatus === 'in_process') mappedStatus = 'Processando';
        if (paymentStatus === 'rejected' || paymentStatus === 'cancelled') mappedStatus = 'Cancelado';

        await db.collection('orders').doc(orderId).update({
          status: mappedStatus,
          mercadoPagoStatus: paymentStatus,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`✅ Status do pedido ${orderId} atualizado no Firestore para '${mappedStatus}'.`);
      }
    }

    // O Mercado Pago exige resposta 200/201 rápida para não reenviar o webhook
    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ Erro ao processar Webhook:', error);
    res.status(200).send('OK (com erro tratado)');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor Malala Store rodando na porta ${PORT}`);
});
