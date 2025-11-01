const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

// Inicializa Firebase Admin uma vez
admin.initializeApp();

// -----------------------------------------------------------------------------
// Carregar Supabase helpers
// -----------------------------------------------------------------------------
let supabaseAvailable = false;
let getSupabaseClient;
let buscarOperacoes;
let inserirOperacao;

try {
  const supabaseModule = require("./supabaseClient");
  getSupabaseClient = supabaseModule.getSupabaseClient;
  buscarOperacoes = supabaseModule.buscarOperacoes;
  inserirOperacao = supabaseModule.inserirOperacao;
  supabaseAvailable = true;
  console.log("✅ Supabase client loaded successfully");
} catch (error) {
  console.warn("⚠️ Supabase client not available:", error.message);
  console.warn("   Rode npm install @supabase/supabase-js se faltar dep.");
}

// Helper simples de CORS + preflight
function applyCors(req, res, methodsAllowed) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", methodsAllowed || "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true; // já respondeu OPTIONS
  }
  return false;
}

// -----------------------------------------------------------------------------
// 1) ping - health básico da Function
// -----------------------------------------------------------------------------
exports.ping = functions
  .region("us-central1")
  .https.onRequest((req, res) => {
    res.json({
      success: true,
      message: "Firebase Functions funcionando!",
      timestamp: new Date().toISOString(),
    });
  });

// -----------------------------------------------------------------------------
// 2) pingSupabase (legado) e trackingPingSupabase (nova rota health Supabase)
// -----------------------------------------------------------------------------
exports.pingSupabase = functions
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    applyCors(req, res, "GET,OPTIONS");
    if (req.method === "OPTIONS") return;
    if (req.method !== "GET") {
      return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    if (!supabaseAvailable) {
      return res.status(500).json({
        success: false,
        error: "Supabase client não carregado.",
      });
    }

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("embarcadores")
        .select("id, nome_principal")
        .limit(5);

      if (error) throw error;

      res.json({
        success: true,
        message: "Supabase conectado com sucesso!",
        count: data.length,
        sample: data,
      });
    } catch (err) {
      console.error("Erro ao conectar Supabase:", err);
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

// trackingPingSupabase → parecida com pingSupabase mas batendo na tabela principal de operações
exports.trackingPingSupabase = functions
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    applyCors(req, res, "GET,OPTIONS");
    if (req.method === "OPTIONS") return;
    if (req.method !== "GET") {
      return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    if (!supabaseAvailable) {
      return res.status(500).json({
        success: false,
        error: "Supabase client não carregado.",
      });
    }

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("operacoes")
        .select("id, booking, status_operacao")
        .limit(1);

      if (error) throw error;

      res.json({
        success: true,
        message: "trackingPingSupabase OK",
        example: data || [],
      });
    } catch (err) {
      console.error("Erro trackingPingSupabase:", err);
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

// -----------------------------------------------------------------------------
// 3) trackingList (GET)
//    Lista operações diretamente do Supabase/Postgres, com filtros opcionais:
//    ?booking=ABC123&status=Programado&limite=20
// -----------------------------------------------------------------------------
exports.trackingList = functions
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    applyCors(req, res, "GET,OPTIONS");
    if (req.method === "OPTIONS") return;
    if (req.method !== "GET") {
      return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    if (!supabaseAvailable) {
      return res.status(500).json({
        success: false,
        error: "Supabase client não carregado.",
      });
    }

    try {
      const filtros = {
        embarcador: req.query.embarcador,
        booking: req.query.booking,
        status: req.query.status,
        limite: req.query.limite ? Number(req.query.limite) : undefined,
      };

      const lista = await buscarOperacoes(filtros);

      res.json({
        success: true,
        total: lista.length,
        data: lista,
      });
    } catch (err) {
      console.error("Erro trackingList:", err);
      res.status(500).json({
        success: false,
        error: "Falha ao consultar operações.",
      });
    }
  });

// -----------------------------------------------------------------------------
// 4) trackingEvent (POST)
//    Cria/insere uma nova operação/evento de tracking no Supabase
//    Body JSON esperado:
//      { embarcador: "AMBEV", booking: "BOOK123", status_operacao: "Programado", ... }
// -----------------------------------------------------------------------------
exports.trackingEvent = functions
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    applyCors(req, res, "POST,OPTIONS");
    if (req.method === "OPTIONS") return;
    if (req.method !== "POST") {
      return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    if (!supabaseAvailable) {
      return res.status(500).json({
        success: false,
        error: "Supabase client não carregado.",
      });
    }

    try {
      const body = req.body || {};

      // Validação mínima obrigatória
      if (!body.embarcador || !body.booking) {
        return res.status(400).json({
          success: false,
          error: "Parâmetros obrigatórios ausentes. Necessário pelo menos { embarcador, booking }.",
        });
      }

      const novaOperacao = await inserirOperacao(body);

      res.json({
        success: true,
        created: novaOperacao,
      });
    } catch (err) {
      console.error("Erro trackingEvent:", err);
      res.status(500).json({
        success: false,
        error: "Falha ao inserir operação.",
      });
    }
  });

// -----------------------------------------------------------------------------
// 5) setUserClaimsOnUpdate
//    Atualiza custom claims no Auth quando Firestore users/{userId} muda
// -----------------------------------------------------------------------------
exports.setUserClaimsOnUpdate = functions.firestore
  .document("users/{userId}")
  .onUpdate(async (change, context) => {
    const userId = context.params.userId;
    const newData = change.after.data();
    const oldData = change.before.data();

    const newRole = newData.role;
    const newAccountType = newData.accountType;

    // Se não mudou, sai cedo
    if (oldData.role === newRole && oldData.accountType === newAccountType) {
      functions.logger.log(`No change in claims for user ${userId}.`);
      return null;
    }

    try {
      await admin.auth().setCustomUserClaims(userId, {
        role: newRole,
        accountType: newAccountType,
      });

      functions.logger.log(
        `Successfully set claims for user ${userId}:`,
        { role: newRole, accountType: newAccountType }
      );

      return { result: `Claims updated for ${userId}.` };
    } catch (error) {
      functions.logger.error(
        `Error setting custom claims for user ${userId}:`,
        error
      );
      return { error: "Failed to set custom claims." };
    }
  });

// -----------------------------------------------------------------------------
// 6) sendClientDelayEmail
//    Função callable que dispara e-mail com atrasos
// -----------------------------------------------------------------------------
exports.sendClientDelayEmail = functions
  .region("us-central1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Requer autenticação."
      );
    }

    const { cliente, emails, operacoes } = data || {};
    if (
      !cliente ||
      !Array.isArray(emails) || emails.length === 0 ||
      !Array.isArray(operacoes) || operacoes.length === 0
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Parâmetros inválidos."
      );
    }

    const cfg = functions.config().smtp || {};
    if (!cfg.host || !cfg.port || !cfg.user || !cfg.pass || !cfg.from) {
      functions.logger.error("SMTP não configurado");
      throw new functions.https.HttpsError(
        "failed-precondition",
        "SMTP não configurado."
      );
    }

    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: Number(cfg.port),
      secure: Number(cfg.port) === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    });

    const htmlRows = (operacoes || [])
      .map((o) => `
      <tr>
        <td style="padding:8px;border:1px solid #e5e7eb;">${o.Booking || "N/A"}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${o.Container || "N/A"}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${o.PortoOperacao || "N/A"}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${o.DataProgramada || "N/A"}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${o.DataChegada || "N/A"}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;">${o.JustificativaAtraso || "N/A"}</td>
      </tr>`
      )
      .join("");

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;color:#111827;">
        <h2 style="margin:0 0 12px 0;">Relatório de Atrasos – ${cliente}</h2>
        <p>Segue abaixo a lista de operações com atraso no período/consulta selecionado.</p>
        <table style="border-collapse:collapse;border:1px solid #e5e7eb;">
          <thead>
            <tr style="background:#0b2263;color:#fff;">
              <th style="padding:8px;border:1px solid #0b2263;">Booking</th>
              <th style="padding:8px;border:1px solid #0b2263;">Container</th>
              <th style="padding:8px;border:1px solid #0b2263;">Porto</th>
              <th style="padding:8px;border:1px solid #0b2263;">Previsão Início</th>
              <th style="padding:8px;border:1px solid #0b2263;">Início Execução</th>
              <th style="padding:8px;border:1px solid #0b2263;">Motivo</th>
            </tr>
          </thead>
          <tbody>${htmlRows}</tbody>
        </table>
        <p style="margin-top:16px;">Att.<br/>Mercosul Line</p>
      </div>
    `;

    await transporter.sendMail({
      from: cfg.from,
      to: emails,
      subject: `Mercosul Line – Atrasos (${cliente})`,
      html,
    });

    return { sent: emails.length };
  });

console.log("✅ Firebase Functions loaded successfully");
