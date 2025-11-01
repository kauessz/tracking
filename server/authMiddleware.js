// server/authMiddleware.js
//
// Middleware que:
// 1. Valida o Bearer token (Firebase ID token) vindo do front logado.
// 2. Consulta tabela `usuarios` no Supabase para saber role/status/embarcador_id.
// 3. Anexa req.userContext = { role, embarcador_id, ... }.
//
// Se você ainda não configurar FIREBASE_SERVICE_ACCOUNT no Render,
// este guard responde 501 em vez de quebrar o servidor.

require('dotenv').config();
const admin = require('firebase-admin');
const { supabase } = require('./supabaseClient');

let adminInitialized = false;

function initFirebaseAdmin() {
  if (adminInitialized) return;

  const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!svcJson) {
    console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT ausente. Rotas seguras vão responder 501.');
    return;
  }

  try {
    const creds = JSON.parse(svcJson);
    admin.initializeApp({
      credential: admin.credential.cert(creds),
    });
    adminInitialized = true;
    console.log('✅ firebase-admin inicializado');
  } catch (err) {
    console.error('Erro inicializando firebase-admin:', err);
  }
}

async function authGuard(req, res, next) {
  if (!adminInitialized) initFirebaseAdmin();
  if (!adminInitialized) {
    return res.status(501).json({
      success: false,
      error: 'Auth não configurada no servidor.',
    });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.substring(7) : null;
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Bearer token ausente.',
    });
  }

  try {
    // Valida ID token do Firebase
    const decoded = await admin.auth().verifyIdToken(token);
    const firebaseUid = decoded.uid;

    // Busca o usuário interno no Supabase
    const { data: userRec, error: uErr } = await supabase
      .from('usuarios')
      .select('id, role, status, embarcador_id')
      .eq('firebase_uid', firebaseUid)
      .single();

    if (uErr || !userRec) {
      return res.status(403).json({
        success: false,
        error: 'Usuário não cadastrado no banco.',
      });
    }

    if (userRec.status !== 'ativo') {
      return res.status(403).json({
        success: false,
        error: 'Usuário não aprovado.',
      });
    }

    req.userContext = {
      firebase_uid: firebaseUid,
      role: userRec.role,
      embarcador_id: userRec.embarcador_id || null,
      usuario_id: userRec.id,
    };

    next();
  } catch (err) {
    console.error('authGuard error:', err);
    return res.status(401).json({
      success: false,
      error: 'Token inválido.',
    });
  }
}

module.exports = { authGuard };
