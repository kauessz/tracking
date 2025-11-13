// server/server.js - VERSÃO CORRIGIDA COMPLETA
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { Pool } = require("pg");
const { supabase } = require("./supabaseClient");

const PORT = process.env.PORT || 8080;

/* -------------------------------------------------
   Conexão Postgres (mesmo banco do Supabase)
------------------------------------------------- */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* -------------------------------------------------
   Firebase Admin (service account vem do .env)
------------------------------------------------- */
function initFirebaseAdmin() {
  if (admin.apps.length) return;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.warn("⚠️  FIREBASE_SERVICE_ACCOUNT não definido. Rotas protegidas vão falhar.");
    return;
  }

  try {
    const svc = JSON.parse(raw);
    if (svc.private_key && svc.private_key.includes("\\n")) {
      svc.private_key = svc.private_key.replace(/\\n/g, "\n");
    }
    admin.initializeApp({ credential: admin.credential.cert(svc) });
    console.log("✅ Firebase Admin inicializado");
  } catch (err) {
    console.error("❌ Erro ao inicializar Firebase Admin:", err);
  }
}
initFirebaseAdmin();

/* -------------------------------------------------
   Helpers gerais
------------------------------------------------- */

// monta whitelist CORS
function buildAllowedOrigins() {
  const extra = ["http://127.0.0.1:5500", "http://localhost:5500"];
  const envStr = process.env.ALLOWED_ORIGINS || "";
  const base = envStr.split(",").map((s) => s.trim()).filter(Boolean);
  const set = new Set([...base, ...extra]);
  return Array.from(set);
}
const allowedOrigins = buildAllowedOrigins();

// CORS dinâmico
function corsOptions(origin, callback) {
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin)) return callback(null, true);
  console.warn("❌ Bloqueado por CORS:", origin);
  return callback(new Error("Not allowed by CORS: " + origin));
}

// converte "dd/mm/aaaa HH:mm" -> ISO
function brToISO(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const [dmy, hm] = dateStr.split(" ");
  if (!dmy || !hm) return null;
  const [dd, mm, yyyy] = dmy.split("/");
  const [HH, MM] = hm.split(":");
  if (!dd || !mm || !yyyy || !HH || !MM) return null;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(HH), Number(MM), 0, 0);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/* -------------------------------------------------
   Funções de usuário interno
------------------------------------------------- */
async function getUserFromPgByUid(uid) {
  const q = await pool.query(
    `SELECT id, firebase_uid, email, nome, role, status, embarcador_id, telefone, cpf
     FROM usuarios
     WHERE firebase_uid = $1
     LIMIT 1`,
    [uid]
  );
  if (q.rowCount === 0) return null;
  return q.rows[0];
}

/* -------------------------------------------------
   Middlewares de auth
------------------------------------------------- */
async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, error: "Token ausente" });

    const decoded = await admin.auth().verifyIdToken(token, true); // ✅ força verificação
    req.user = { uid: decoded.uid, email: decoded.email || "" };
    next();
  } catch (err) {
    console.error("authMiddleware error:", err);
    return res.status(401).json({ success: false, error: "Token inválido" });
  }
}

async function verifyTokenAndAttachUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) return res.status(401).json({ success: false, error: "missing_token" });

    const idToken = match[1];
    const decoded = await admin.auth().verifyIdToken(idToken, true); // ✅ força verificação
    const firebaseUid = decoded.uid;

    const internalUser = await getUserFromPgByUid(firebaseUid);
    if (!internalUser) return res.status(403).json({ success: false, error: "user_not_found" });
    if (internalUser.status !== "ativo")
      return res.status(403).json({ success: false, error: "user_not_active" });

    req.appUser = internalUser;
    req.firebaseUid = firebaseUid;
    next();
  } catch (err) {
    console.error("verifyTokenAndAttachUser error:", err);
    return res.status(401).json({ success: false, error: "invalid_token" });
  }
}

async function requireAdmin(req, res, next) {
  try {
    if (req.appUser) {
      if (req.appUser.status === "ativo" && req.appUser.role === "admin") return next();
      return res.status(403).json({ success: false, error: "forbidden_not_admin", user: req.appUser });
    }

    const header = req.headers.authorization || "";
    const tokenStr = header.startsWith("Bearer ") ? header.substring("Bearer ".length) : null;
    if (!tokenStr) return res.status(401).json({ success: false, error: "missing_token" });

    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(tokenStr, true); // ✅ força verificação
    } catch (err) {
      console.error("requireAdmin verifyIdToken error:", err);
      return res.status(401).json({ success: false, error: "invalid_token" });
    }

    const uid = decoded.uid;
    const internalUser = await getUserFromPgByUid(uid);
    if (!internalUser) return res.status(403).json({ success: false, error: "user_not_found_in_db" });
    if (internalUser.status !== "ativo")
      return res.status(403).json({ success: false, error: "user_not_active", user: internalUser });
    if (internalUser.role !== "admin")
      return res.status(403).json({ success: false, error: "forbidden_not_admin", user: internalUser });

    req.internalUser = internalUser;
    next();
  } catch (err) {
    console.error("requireAdmin fatal:", err);
    return res.status(500).json({ success: false, error: "server_error_auth_admin" });
  }
}

/* -------------------------------------------------
   Express app
------------------------------------------------- */
const app = express();
app.set("etag", false);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cors({ origin: corsOptions, credentials: false }));

// ✅ HEADERS NO-CACHE PARA EVITAR PROBLEMAS DE LOGIN
app.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  next();
});

/* -------------------------------------------------
   Rota de saúde
------------------------------------------------- */
app.get("/", (req, res) => res.json({ ok: true, message: "API Tracking up" }));

/* -------------------------------------------------
   Diagnóstico rápido Supabase
------------------------------------------------- */
app.get("/trackingPingSupabase", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("operacoes")
      .select("id, booking, status_operacao")
      .limit(5);
    if (error) throw error;
    return res.json({ success: true, message: "trackingPingSupabase OK", total: data.length, data });
  } catch (err) {
    console.error("trackingPingSupabase error:", err);
    return res.status(500).json({ success: false, error: "Erro consultando Supabase" });
  }
});

/* -------------------------------------------------
   WHOAMI
------------------------------------------------- */
app.get("/auth/whoami", authMiddleware, async (req, res) => {
  try {
    const internalUser = await getUserFromPgByUid(req.user.uid);
    if (!internalUser) {
      return res.status(403).json({ success: false, error: "user_not_found_in_db", user: null });
    }
    return res.json({ success: true, user: internalUser });
  } catch (err) {
    console.error("/auth/whoami error:", err);
    return res.status(500).json({ success: false, error: "server_error_whoami" });
  }
});

/* -------------------------------------------------
   ✅ REGISTRO COM TELEFONE E CPF
------------------------------------------------- */
app.post("/auth/register", authMiddleware, async (req, res) => {
  try {
    const { email, nome, telefone, cpf, tipoConta } = req.body;
    const firebaseUid = req.user.uid;

    console.log("📝 Registro:", { email, nome, telefone, cpf, tipoConta, firebaseUid });

    // Valida campos obrigatórios
    if (!email || !nome || !telefone || !cpf) {
      return res.status(400).json({ 
        success: false, 
        error: "missing_fields",
        message: "Email, nome, telefone e CPF são obrigatórios" 
      });
    }

    // Verifica se já existe
    const existing = await pool.query(
      "SELECT id FROM usuarios WHERE firebase_uid = $1 OR email = $2 LIMIT 1",
      [firebaseUid, email]
    );

    if (existing.rowCount > 0) {
      return res.status(400).json({
        success: false,
        error: "user_already_registered",
        message: "Usuário já cadastrado. Aguarde aprovação."
      });
    }

    // Determina role baseado no tipoConta
    const role = tipoConta === "internal" ? "admin" : "embarcador";

    // Insere no banco
    const q = await pool.query(
      `INSERT INTO usuarios (firebase_uid, email, nome, telefone, cpf, role, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pendente')
       RETURNING id, email, nome, role, status`,
      [firebaseUid, email, nome, telefone, cpf, role]
    );

    console.log("✅ Usuário registrado:", q.rows[0]);

    return res.json({
      success: true,
      message: "Cadastro enviado para aprovação",
      user: q.rows[0]
    });
  } catch (err) {
    console.error("❌ /auth/register error:", err);
    return res.status(500).json({ 
      success: false, 
      error: "server_error_register",
      message: "Erro ao processar cadastro" 
    });
  }
});

/* -------------------------------------------------
   ✅ LISTAR USUÁRIOS PENDENTES
------------------------------------------------- */
app.get("/admin/pendingUsers", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT id, firebase_uid, email, nome, telefone, cpf, role, status, embarcador_id, data_criacao
       FROM usuarios
       WHERE status = 'pendente'
       ORDER BY data_criacao DESC`
    );

    return res.json({ success: true, users: q.rows });
  } catch (err) {
    console.error("❌ /admin/pendingUsers error:", err);
    return res.status(500).json({ success: false, error: "server_error_pending_users" });
  }
});

/* -------------------------------------------------
   ✅ APROVAR USUÁRIO (com embarcador_id opcional)
------------------------------------------------- */
app.post("/admin/approveUser", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const { id, role, embarcador_id } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, error: "missing_id" });
    }

    // Monta query dinamicamente
    let query = "UPDATE usuarios SET status = 'ativo'";
    let params = [];
    let paramCount = 1;

    if (role) {
      query += `, role = $${paramCount}`;
      params.push(role);
      paramCount++;
    }

    if (embarcador_id) {
      query += `, embarcador_id = $${paramCount}`;
      params.push(embarcador_id);
      paramCount++;
    }

    query += ` WHERE id = $${paramCount} RETURNING id, email, nome, role, status, embarcador_id`;
    params.push(id);

    const q = await pool.query(query, params);

    if (q.rowCount === 0) {
      return res.status(404).json({ success: false, error: "user_not_found" });
    }

    console.log("✅ Usuário aprovado:", q.rows[0]);

    return res.json({
      success: true,
      message: "Usuário aprovado com sucesso",
      user: q.rows[0]
    });
  } catch (err) {
    console.error("❌ /admin/approveUser error:", err);
    return res.status(500).json({ success: false, error: "server_error_approve" });
  }
});

/* -------------------------------------------------
   ✅ REJEITAR USUÁRIO
------------------------------------------------- */
app.post("/admin/rejectUser", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, error: "missing_id" });
    }

    const q = await pool.query(
      "UPDATE usuarios SET status = 'rejeitado' WHERE id = $1 RETURNING id, email, nome",
      [id]
    );

    if (q.rowCount === 0) {
      return res.status(404).json({ success: false, error: "user_not_found" });
    }

    console.log("✅ Usuário rejeitado:", q.rows[0]);

    return res.json({
      success: true,
      message: "Usuário rejeitado",
      user: q.rows[0]
    });
  } catch (err) {
    console.error("❌ /admin/rejectUser error:", err);
    return res.status(500).json({ success: false, error: "server_error_reject" });
  }
});

/* -------------------------------------------------
   CONSULTA PÚBLICA /trackingList
------------------------------------------------- */
app.get("/trackingList", async (req, res) => {
  try {
    const q = (req.query.booking || "").toString().trim();
    if (!q) {
      return res.status(400).json({ success: false, error: "Informe booking ou container" });
    }

    const { data, error } = await supabase
      .from("operacoes")
      .select("*")
      .or(`booking.ilike.%${q}%,containers.ilike.%${q}%`)
      .order("id", { ascending: false })
      .limit(50);

    if (error) throw error;

    return res.json({ success: true, items: data || [] });
  } catch (err) {
    console.error("trackingList error:", err);
    return res.status(500).json({ success: false, error: "Erro consultando Supabase" });
  }
});

/* -------------------------------------------------
   ADMIN - TODAS OPERAÇÕES
------------------------------------------------- */
app.get("/admin/allOps", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("operacoes")
      .select(`
        id, numero_programacao, booking, containers,
        pol, pod, tipo_programacao,
        previsao_inicio_atendimento, dt_inicio_execucao, dt_fim_execucao,
        dt_previsao_entrega_recalculada,
        nome_motorista, placa_veiculo, placa_carreta, cpf_motorista,
        justificativa_atraso, embarcador_id, status_operacao, motivo_atraso,
        data_criacao, data_atualizacao,
        embarcadores (nome_principal)
      `)
      .order("id", { ascending: false });

    if (error) throw error;

    // Mapeia embarcador_nome
    const items = (data || []).map(row => ({
      ...row,
      embarcador_nome: row.embarcadores?.nome_principal || null
    }));

    return res.json({ success: true, items });
  } catch (err) {
    console.error("/admin/allOps error:", err);
    return res.status(500).json({ success: false, error: "server_error_all_ops" });
  }
});

/* -------------------------------------------------
   ✅ ADMIN - UPLOAD DE OPERAÇÕES (SIMPLIFICADO)
------------------------------------------------- */
app.post("/admin/importOperations", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const { records } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, error: "missing_records" });
    }

    console.log(`📦 Importando ${records.length} operações...`);

    let inserted = 0, updated = 0, skipped = 0;

    for (const rec of records) {
      try {
        if (!rec.Booking) {
          skipped++;
          continue;
        }

        // Resolve embarcador
        let embarcadorId = null;
        if (rec.Cliente) {
          const { data: embData } = await supabase
            .from("embarcadores")
            .select("id")
            .eq("nome_principal", rec.Cliente)
            .single();

          if (embData?.id) {
            embarcadorId = embData.id;
          } else {
            const { data: newEmb, error: newEmbErr } = await supabase
              .from("embarcadores")
              .insert({ nome_principal: rec.Cliente })
              .select("id")
              .single();

            if (!newEmbErr && newEmb?.id) {
              embarcadorId = newEmb.id;
            }
          }
        }

        // Converte datas
        const dataProgISO = rec.DataProgramada ? (brToISO(rec.DataProgramada) || null) : null;
        const dataChegISO = rec.DataChegada ? (brToISO(rec.DataChegada) || null) : null;

        // Verifica se já existe
        const { data: existingOp } = await supabase
          .from("operacoes")
          .select("id")
          .eq("booking", rec.Booking)
          .maybeSingle();

        const payload = {
          containers: rec.Container || null,
          pol: rec.PortoOperacao || null,
          pod: rec.PortoOperacao || null,
          tipo_programacao: rec.TipoOperacao || null,
          previsao_inicio_atendimento: dataProgISO,
          dt_inicio_execucao: dataChegISO,
          justificativa_atraso: rec.JustificativaAtraso || null,
          embarcador_id: embarcadorId,
          status_operacao: "Programado",
          data_atualizacao: new Date().toISOString(),
        };

        if (existingOp?.id) {
          await supabase.from("operacoes").update(payload).eq("id", existingOp.id);
          updated++;
        } else {
          await supabase.from("operacoes").insert({
            numero_programacao: `PROG-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            booking: rec.Booking,
            ...payload
          });
          inserted++;
        }
      } catch (recErr) {
        console.error("Erro processando registro:", recErr);
        skipped++;
      }
    }

    console.log(`✅ Importação concluída: ${inserted} inseridas, ${updated} atualizadas, ${skipped} ignoradas`);

    return res.json({
      success: true,
      processed: inserted + updated + skipped,
      inserted,
      updated,
      skipped,
      message: `Importação concluída`
    });
  } catch (err) {
    console.error("❌ /admin/importOperations error:", err);
    return res.status(500).json({ success: false, error: "server_error_import", details: err.message });
  }
});

/* -------------------------------------------------
   Limpar dados (admin)
------------------------------------------------- */
app.delete("/admin/clearData", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from("operacoes").delete().neq("id", 0);
    if (error) return res.status(500).json({ success: false, error: "db_error", details: error.message });

    try {
      await supabase.from("historico_operacoes").delete().neq("id", 0);
    } catch (_) {}
    
    return res.json({ success: true, deleted: data?.length || 0, message: "Dados limpos com sucesso" });
  } catch (err) {
    console.error("Erro /admin/clearData:", err);
    return res.status(500).json({ success: false, error: "server_error_clear" });
  }
});

/* -------------------------------------------------
   APOIO: listar / criar embarcador por nome (admin)
------------------------------------------------- */
app.get("/admin/embarcadores", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const search = (req.query.search || "").toString().trim();
    let q = supabase
      .from("embarcadores")
      .select("id, nome_principal")
      .order("nome_principal", { ascending: true })
      .limit(200);
    
    if (search) q = q.ilike("nome_principal", `%${search}%`);
    
    const { data, error } = await q;
    if (error) throw error;
    
    return res.json({ success: true, items: data || [] });
  } catch (err) {
    console.error("embarcadores list error:", err);
    return res.status(500).json({ success: false, error: "server_error_embarcadores" });
  }
});

app.post("/admin/ensureEmbarcador", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const nome = (req.body?.nome || "").toString().trim();
    if (!nome) return res.status(400).json({ success: false, error: "missing_name" });
    
    const { data: found } = await supabase
      .from("embarcadores")
      .select("id")
      .eq("nome_principal", nome)
      .maybeSingle();
    
    if (found?.id) return res.json({ success: true, id: found.id, created: false });

    const { data: created, error } = await supabase
      .from("embarcadores")
      .insert({ nome_principal: nome })
      .select("id")
      .single();
    
    if (error) throw error;
    
    return res.json({ success: true, id: created.id, created: true });
  } catch (err) {
    console.error("ensureEmbarcador error:", err);
    return res.status(500).json({ success: false, error: "server_error_ensure_embarcador" });
  }
});

/* -------------------------------------------------
   ✅ PORTAL (cliente): minhas operações (CORRIGIDO)
------------------------------------------------- */
app.get("/portal/myOps", authMiddleware, async (req, res) => {
  try {
    // Pega usuário interno e valida ativo
    const internal = await getUserFromPgByUid(req.user.uid);
    if (!internal) {
      return res.status(403).json({ success: false, error: "user_not_found_in_db" });
    }
    
    if (internal.status !== "ativo") {
      return res.status(403).json({ success: false, error: "user_not_active" });
    }

    // Admin não usa esta rota; embarcador precisa ter embarcador_id
    if (internal.role !== "embarcador" || !internal.embarcador_id) {
      return res.status(403).json({ success: false, error: "no_shipper_linked" });
    }

    const { data, error } = await supabase
      .from("operacoes")
      .select(`
        id, booking, containers, tipo_programacao,
        previsao_inicio_atendimento, dt_inicio_execucao, dt_fim_execucao,
        justificativa_atraso, status_operacao, pol, pod, motivo_atraso,
        embarcador_id
      `)
      .eq("embarcador_id", internal.embarcador_id)
      .order("previsao_inicio_atendimento", { ascending: false })
      .limit(1000);

    if (error) throw error;

    const items = (data || []).map((row) => {
      const tipo = (row.tipo_programacao || "").toLowerCase();
      let porto_operacao = row.pol || row.pod || null;
      if (tipo.startsWith("colet")) porto_operacao = row.pol || null;
      if (tipo.startsWith("entreg")) porto_operacao = row.pod || null;

      return {
        booking: row.booking || null,
        containers: row.containers || null,
        tipo_programacao: row.tipo_programacao || null,
        previsao_inicio_atendimento: row.previsao_inicio_atendimento || null,
        dt_inicio_execucao: row.dt_inicio_execucao || null,
        dt_fim_execucao: row.dt_fim_execucao || null,
        justificativa_atraso: row.justificativa_atraso || null,
        motivo_atraso: row.motivo_atraso || null,
        status_operacao: row.status_operacao || null,
        porto_operacao,
      };
    });

    console.log(`✅ Portal myOps: ${items.length} operações para embarcador_id ${internal.embarcador_id}`);

    return res.json({ success: true, items });
  } catch (err) {
    console.error("❌ /portal/myOps error:", err);
    return res.status(500).json({ success: false, error: "server_error_myops" });
  }
});

/* -------------------------------------------------
   ✅ OCORRÊNCIAS - CRIAR
------------------------------------------------- */
app.post("/ocorrencias/create", authMiddleware, async (req, res) => {
  try {
    const {
      booking,
      container,
      embarcador_nome,
      porto,
      previsao_original,
      tipo_ocorrencia,
      descricao,
      nova_previsao
    } = req.body;

    if (!booking || !embarcador_nome || !tipo_ocorrencia || !descricao) {
      return res.status(400).json({
        success: false,
        error: "missing_fields",
        message: "Booking, embarcador, tipo e descrição são obrigatórios"
      });
    }

    const { data, error } = await supabase
      .from("ocorrencias")
      .insert({
        booking,
        container: container || null,
        embarcador_nome,
        porto: porto || null,
        previsao_inicio_atendimento: previsao_original || null,
        tipo_ocorrencia,
        descricao_ocorrencia: descricao,
        nova_previsao: nova_previsao || null,
        status: 'pendente',
        criado_por: req.user.email || null
      })
      .select()
      .single();

    if (error) throw error;

    console.log("✅ Ocorrência criada:", data);

    return res.json({
      success: true,
      message: "Ocorrência registrada com sucesso",
      ocorrencia: data
    });
  } catch (err) {
    console.error("❌ /ocorrencias/create error:", err);
    return res.status(500).json({ success: false, error: "server_error_create_occurrence" });
  }
});

/* -------------------------------------------------
   ✅ OCORRÊNCIAS - LISTAR (ADMIN)
------------------------------------------------- */
app.get("/admin/ocorrencias", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const status = req.query.status || 'pendente';

    let query = supabase
      .from("ocorrencias")
      .select("*")
      .order("data_criacao", { ascending: false })
      .limit(500);

    if (status !== 'all') {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.json({ success: true, items: data || [] });
  } catch (err) {
    console.error("❌ /admin/ocorrencias error:", err);
    return res.status(500).json({ success: false, error: "server_error_list_occurrences" });
  }
});

/* -------------------------------------------------
   ✅ OCORRÊNCIAS - PROCESSAR (ADMIN)
------------------------------------------------- */
app.post("/admin/ocorrencias/process", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const { id, action } = req.body; // action: 'approve' ou 'reject'

    if (!id || !action) {
      return res.status(400).json({ success: false, error: "missing_params" });
    }

    const newStatus = action === 'approve' ? 'processada' : 'rejeitada';

    const { data, error } = await supabase
      .from("ocorrencias")
      .update({
        status: newStatus,
        data_processamento: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Ocorrência ${newStatus}:`, data);

    return res.json({
      success: true,
      message: `Ocorrência ${newStatus} com sucesso`,
      ocorrencia: data
    });
  } catch (err) {
    console.error("❌ /admin/ocorrencias/process error:", err);
    return res.status(500).json({ success: false, error: "server_error_process_occurrence" });
  }
});

/* -------------------------------------------------
   Sobe o servidor
------------------------------------------------- */
app.listen(PORT, () => {
  console.log(`🚚 API Tracking rodando na porta ${PORT}`);
  console.log(`📋 Endpoints disponíveis:`);
  console.log(`   GET  / - Health check`);
  console.log(`   GET  /trackingPingSupabase - Diagnóstico`);
  console.log(`   GET  /trackingList - Consulta pública`);
  console.log(`   GET  /auth/whoami - Verificar usuário`);
  console.log(`   POST /auth/register - Registro com telefone e CPF`);
  console.log(`   GET  /admin/pendingUsers - Listar pendentes`);
  console.log(`   POST /admin/approveUser - Aprovar usuário`);
  console.log(`   POST /admin/rejectUser - Rejeitar usuário`);
  console.log(`   GET  /admin/allOps - Todas operações`);
  console.log(`   POST /admin/importOperations - Upload`);
  console.log(`   GET  /admin/embarcadores - Listar embarcadores`);
  console.log(`   GET  /portal/myOps - Operações do embarcador`);
  console.log(`   POST /ocorrencias/create - Criar ocorrência`);
  console.log(`   GET  /admin/ocorrencias - Listar ocorrências`);
  console.log(`   POST /admin/ocorrencias/process - Processar ocorrência`);
});