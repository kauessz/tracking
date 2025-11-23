// server/server.js - VERSÃO 2.0 - CORREÇÕES COMPLETAS
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { Pool } = require("pg");
const { supabase } = require("./supabaseClient");
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

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

// ✅ NOVO: Formata data ISO para BR
function isoToBR(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return null;

  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const HH = String(d.getHours()).padStart(2, '0');
  const MM = String(d.getMinutes()).padStart(2, '0');

  return `${dd}/${mm}/${yyyy} ${HH}:${MM}`;
}

// ✅ NOVO: Normalizar nome de embarcador (remove filiais)
function normalizarNomeEmbarcador(nome) {
  if (!nome) return nome;

  // Remove padrões comuns de filiais
  const padroes = [
    / - [^-]+$/i,           // Remove " - Jacaraí", " - Pirai", etc
    / \([^)]+\)$/i,         // Remove " (Filial Sul)", etc
    / filial [^,]+$/i,      // Remove " Filial Norte", etc
    / unidade [^,]+$/i,     // Remove " Unidade Rio", etc
  ];

  let nomeNormalizado = nome.trim();

  for (const padrao of padroes) {
    nomeNormalizado = nomeNormalizado.replace(padrao, '').trim();
  }

  return nomeNormalizado;
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

    const decoded = await admin.auth().verifyIdToken(token, true);
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
    const decoded = await admin.auth().verifyIdToken(idToken, true);
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
      decoded = await admin.auth().verifyIdToken(tokenStr, true);
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
    const internal = await getUserFromPgByUid(req.user.uid);
    if (!internal) {
      return res.json({
        success: true,
        user: {
          email: req.user.email,
          status: "pendente"
        }
      });
    }

    return res.json({
      success: true,
      user: {
        id: internal.id,
        email: internal.email,
        nome: internal.nome,
        role: internal.role,
        status: internal.status,
        embarcador_id: internal.embarcador_id,
        telefone: internal.telefone,
        cpf: internal.cpf
      }
    });
  } catch (err) {
    console.error("whoami error:", err);
    return res.status(500).json({ success: false, error: "server_error_whoami" });
  }
});

/* -------------------------------------------------
   REGISTRO (CADASTRO) com telefone e CPF
------------------------------------------------- */
app.post("/auth/register", authMiddleware, async (req, res) => {
  try {
    const { nome, telefone, cpf } = req.body;
    const firebaseUid = req.user.uid;
    const email = req.user.email;

    if (!nome) {
      return res.status(400).json({ success: false, error: "missing_nome" });
    }

    const existingUser = await getUserFromPgByUid(firebaseUid);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: "user_already_registered",
        message: "Usuário já cadastrado",
        user: existingUser
      });
    }

    const q = await pool.query(
      `INSERT INTO usuarios 
       (firebase_uid, email, nome, telefone, cpf, role, status) 
       VALUES ($1, $2, $3, $4, $5, 'embarcador', 'pendente') 
       RETURNING id, firebase_uid, email, nome, telefone, cpf, role, status`,
      [firebaseUid, email, nome, telefone || null, cpf || null]
    );

    const newUser = q.rows[0];
    console.log("✅ Novo usuário registrado (pendente):", newUser);

    return res.json({
      success: true,
      message: "Cadastro realizado com sucesso! Aguarde aprovação do administrador.",
      user: newUser
    });
  } catch (err) {
    console.error("❌ /auth/register error:", err);
    return res.status(500).json({ success: false, error: "server_error_register", details: err.message });
  }
});

/* -------------------------------------------------
   LISTAR USUÁRIOS PENDENTES (ADMIN)
------------------------------------------------- */
app.get("/admin/pendingUsers", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const q = await pool.query(
      `SELECT id, firebase_uid, email, nome, telefone, cpf, role, status, embarcador_id, data_criacao
       FROM usuarios
       WHERE status = 'pendente'
       ORDER BY data_criacao DESC`
    );

    console.log(`✅ Usuários pendentes: ${q.rowCount}`);

    return res.json({
      success: true,
      users: q.rows || []
    });
  } catch (err) {
    console.error("❌ /admin/pendingUsers error:", err);
    return res.status(500).json({ success: false, error: "server_error_pending" });
  }
});

/* -------------------------------------------------
   APROVAR USUÁRIO (ADMIN)
------------------------------------------------- */
app.post("/admin/approveUser", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const { id, role, embarcador_id } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, error: "missing_id" });
    }

    if (role === 'embarcador' && !embarcador_id) {
      return res.status(400).json({
        success: false,
        error: "missing_embarcador_id",
        message: "Para tipo de conta 'Cliente/Embarcador', é necessário vincular um embarcador"
      });
    }

    const updateFields = ['status = $1'];
    const updateValues = ['ativo'];
    let paramCount = 1;

    if (role) {
      paramCount++;
      updateFields.push(`role = $${paramCount}`);
      updateValues.push(role);
    }

    if (embarcador_id) {
      paramCount++;
      updateFields.push(`embarcador_id = $${paramCount}`);
      updateValues.push(embarcador_id);
    }

    paramCount++;
    updateValues.push(id);

    const query = `
      UPDATE usuarios 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, email, nome, role, status, embarcador_id
    `;

    const q = await pool.query(query, updateValues);

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
    return res.status(500).json({ success: false, error: "server_error_approve", details: err.message });
  }
});

/* -------------------------------------------------
   REJEITAR USUÁRIO (ADMIN)
------------------------------------------------- */
app.post("/admin/rejectUser", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, error: "missing_id" });
    }

    const userQuery = await pool.query(
      "SELECT id, firebase_uid, email, nome FROM usuarios WHERE id = $1",
      [id]
    );

    if (userQuery.rowCount === 0) {
      return res.status(404).json({ success: false, error: "user_not_found" });
    }

    const user = userQuery.rows[0];

    const q = await pool.query(
      "UPDATE usuarios SET status = 'rejeitado' WHERE id = $1 RETURNING id, email, nome, status",
      [id]
    );

    if (q.rowCount === 0) {
      return res.status(404).json({ success: false, error: "user_not_found" });
    }

    try {
      if (user.firebase_uid) {
        await admin.auth().updateUser(user.firebase_uid, {
          disabled: true
        });
        console.log(`✅ Usuário desabilitado no Firebase: ${user.firebase_uid}`);
      }
    } catch (firebaseErr) {
      console.warn("⚠️  Erro ao desabilitar usuário no Firebase:", firebaseErr);
    }

    console.log("✅ Usuário rejeitado:", q.rows[0]);

    return res.json({
      success: true,
      message: "Usuário rejeitado com sucesso",
      user: q.rows[0]
    });
  } catch (err) {
    console.error("❌ /admin/rejectUser error:", err);
    return res.status(500).json({ success: false, error: "server_error_reject", details: err.message });
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
      .select(`
        id, booking, containers,
        previsao_inicio_atendimento, dt_inicio_execucao, dt_fim_execucao,
        dt_previsao_entrega_recalculada,
        nome_motorista, cpf_motorista, placa_veiculo, placa_carreta,
        justificativa_atraso, status_operacao,
        embarcadores (nome_principal)
      `)
      .or(`booking.ilike.%${q}%,containers.ilike.%${q}%`)
      .order("id", { ascending: false })
      .limit(50);

    if (error) throw error;

    const items = (data || []).map(row => ({
      ...row,
      embarcador_nome: row.embarcadores?.nome_principal || null,
      container: row.containers || null
    }));

    return res.json({ success: true, items });
  } catch (err) {
    console.error("trackingList error:", err);
    return res.status(500).json({ success: false, error: "Erro consultando Supabase" });
  }
});

/* -------------------------------------------------
   ADMIN - TODAS OPERAÇÕES (CORRIGIDO - PORTO)
------------------------------------------------- */
app.get("/admin/allOps", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    // ✅ PAGINAÇÃO: Parâmetros de página
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 1000;

    // Limites de segurança
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(Math.max(1, pageSize), 10000);

    const from = (safePage - 1) * safePageSize;
    const to = from + safePageSize - 1;

    // ✅ Buscar total de registros primeiro
    const { count: totalCount } = await supabase
      .from("operacoes")
      .select("*", { count: "exact", head: true });

    // ✅ Buscar dados com paginação
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
      .order("id", { ascending: false })
      .range(from, to);

    if (error) throw error;

    // ✅ CORREÇÃO: Determinar porto_operacao baseado no tipo
    const items = (data || []).map(row => {
      const tipo = (row.tipo_programacao || "").toLowerCase();
      let porto_operacao = null;

      if (tipo.includes("colet")) {
        porto_operacao = row.pol || null;
      } else if (tipo.includes("entreg")) {
        porto_operacao = row.pod || null;
      } else {
        porto_operacao = row.pol || row.pod || null;
      }

      return {
        ...row,
        embarcador_nome: row.embarcadores?.nome_principal || null,
        porto_operacao
      };
    });

    // ✅ Cálculo de paginação
    const totalPages = Math.ceil((totalCount || 0) / safePageSize);
    const hasNextPage = safePage < totalPages;
    const hasPreviousPage = safePage > 1;

    return res.json({
      success: true,
      items,
      pagination: {
        currentPage: safePage,
        pageSize: safePageSize,
        totalItems: totalCount || 0,
        totalPages: totalPages,
        hasNextPage: hasNextPage,
        hasPreviousPage: hasPreviousPage
      }
    });
  } catch (err) {
    console.error("/admin/allOps error:", err);
    return res.status(500).json({ success: false, error: "server_error_all_ops" });
  }
});

/* -------------------------------------------------
   ADMIN - UPLOAD DE OPERAÇÕES
------------------------------------------------- */
app.post("/admin/importOperations", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const { records } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, error: "missing_records" });
    }

    console.log(`📦 Importando ${records.length} operações...`);

    // ✅ CORREÇÃO: Cache de embarcadores para melhor performance
    const embarcadorCache = new Map();

    // ✅ CORREÇÃO: Normalização de embarcadores
    const getOrCreateEmbarcador = async (nomeOriginal) => {
      if (!nomeOriginal) return null;

      const nomeNormalizado = normalizarNomeEmbarcador(nomeOriginal);

      // Verifica cache
      if (embarcadorCache.has(nomeNormalizado)) {
        return embarcadorCache.get(nomeNormalizado);
      }

      // Busca no banco
      const { data: embData } = await supabase
        .from("embarcadores")
        .select("id")
        .eq("nome_principal", nomeNormalizado)
        .single();

      if (embData?.id) {
        embarcadorCache.set(nomeNormalizado, embData.id);
        return embData.id;
      }

      // Cria novo
      const { data: newEmb, error: newEmbErr } = await supabase
        .from("embarcadores")
        .insert({ nome_principal: nomeNormalizado })
        .select("id")
        .single();

      if (!newEmbErr && newEmb?.id) {
        embarcadorCache.set(nomeNormalizado, newEmb.id);
        console.log(`✅ Novo embarcador criado: ${nomeNormalizado} (ID: ${newEmb.id})`);
        return newEmb.id;
      }

      return null;
    };

    let inserted = 0, updated = 0, skipped = 0;

    // ✅ OTIMIZAÇÃO: Processar em lotes de 100
    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      await Promise.all(batch.map(async (rec) => {
        try {
          // ✅ CORREÇÃO: Valida apenas Número de Programação
          if (!rec.NumeroProgramacao) {
            skipped++;
            return;
          }

          const embarcadorId = await getOrCreateEmbarcador(rec.Cliente);

          const prevInicioISO = rec.DataProgramada ? (brToISO(rec.DataProgramada) || null) : null;
          const dtInicioExecISO = rec.DataChegada ? (brToISO(rec.DataChegada) || null) : null;
          const dtFimExecISO = rec.DataFim ? (brToISO(rec.DataFim) || null) : null;
          const dtPrevEntregaRecalcISO = rec.DataEntregaRecalculada ? (brToISO(rec.DataEntregaRecalculada) || null) : null;

          const { data: existingOp } = await supabase
            .from("operacoes")
            .select("id")
            .eq("numero_programacao", rec.NumeroProgramacao)
            .maybeSingle();

          const payload = {
            booking: rec.Booking,
            containers: rec.Container || null,
            pol: rec.POL || null,
            pod: rec.POD || null,
            tipo_programacao: rec.TipoOperacao || null,
            previsao_inicio_atendimento: prevInicioISO,
            dt_inicio_execucao: dtInicioExecISO,
            dt_fim_execucao: dtFimExecISO,
            dt_previsao_entrega_recalculada: dtPrevEntregaRecalcISO,
            nome_motorista: rec.NomeMotorista || null,
            cpf_motorista: rec.CPFMotorista || null,
            placa_veiculo: rec.PlacaVeiculo || null,
            placa_carreta: rec.PlacaCarreta || null,
            justificativa_atraso: rec.JustificativaAtraso || null,
            motivo_atraso: rec.MotivoAtraso || null,
            embarcador_id: embarcadorId,
            status_operacao: rec.StatusOperacao || "Programado",
            data_atualizacao: new Date().toISOString(),
          };

          if (existingOp?.id) {
            await supabase.from("operacoes").update(payload).eq("id", existingOp.id);
            updated++;
          } else {
            await supabase.from("operacoes").insert({
              numero_programacao: rec.NumeroProgramacao,
              ...payload
            });
            inserted++;
          }
        } catch (recErr) {
          console.error("❌ Erro processando registro:", recErr);
          skipped++;
        }
      }));

      // Log de progresso
      console.log(`📊 Progresso: ${Math.min(i + batchSize, records.length)}/${records.length} registros processados`);
    }

    console.log(`✅ Importação concluída: ${inserted} inseridas, ${updated} atualizadas, ${skipped} ignoradas`);

    return res.json({
      success: true,
      processed: inserted + updated + skipped,
      inserted,
      updated,
      skipped,
      message: `Importação concluída: ${inserted} novas, ${updated} atualizadas, ${skipped} ignoradas`
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
    } catch (_) { }

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
   PORTAL (cliente): minhas operações (CORRIGIDO - PORTO)
------------------------------------------------- */
app.get("/portal/myOps", authMiddleware, async (req, res) => {
  try {
    const internal = await getUserFromPgByUid(req.user.uid);
    if (!internal) {
      return res.status(403).json({ success: false, error: "user_not_found_in_db" });
    }

    if (internal.status !== "ativo") {
      return res.status(403).json({ success: false, error: "user_not_active" });
    }

    if (internal.role !== "embarcador" || !internal.embarcador_id) {
      return res.status(403).json({ success: false, error: "no_shipper_linked" });
    }

    const { data, error } = await supabase
      .from("operacoes")
      .select(`
        id, booking, containers, tipo_programacao,
        previsao_inicio_atendimento, dt_inicio_execucao, dt_fim_execucao,
        dt_previsao_entrega_recalculada,
        nome_motorista, cpf_motorista, placa_veiculo, placa_carreta,
        justificativa_atraso, status_operacao, pol, pod, motivo_atraso,
        embarcador_id,
        embarcadores (nome_principal)
      `)
      .eq("embarcador_id", internal.embarcador_id)
      .order("previsao_inicio_atendimento", { ascending: false })
      .limit(10000);

    if (error) throw error;

    const items = (data || []).map((row) => {
      const tipo = (row.tipo_programacao || "").toLowerCase();
      let porto_operacao = null;

      // ✅ CORREÇÃO: Lógica correta de porto baseado no tipo
      if (tipo.includes("colet")) {
        porto_operacao = row.pol || null;
      } else if (tipo.includes("entreg")) {
        porto_operacao = row.pod || null;
      } else {
        porto_operacao = row.pol || row.pod || null;
      }

      return {
        booking: row.booking || null,
        containers: row.containers || null,
        tipo_programacao: row.tipo_programacao || null,
        previsao_inicio_atendimento: row.previsao_inicio_atendimento || null,
        dt_inicio_execucao: row.dt_inicio_execucao || null,
        dt_fim_execucao: row.dt_fim_execucao || null,
        dt_previsao_entrega_recalculada: row.dt_previsao_entrega_recalculada || null,
        nome_motorista: row.nome_motorista || null,
        cpf_motorista: row.cpf_motorista || null,
        placa_veiculo: row.placa_veiculo || null,
        placa_carreta: row.placa_carreta || null,
        justificativa_atraso: row.justificativa_atraso || null,
        motivo_atraso: row.motivo_atraso || null,
        status_operacao: row.status_operacao || null,
        porto_operacao,
        embarcador_nome: row.embarcadores?.nome_principal || null,
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
   OCORRÊNCIAS - CRIAR (PÚBLICA)
------------------------------------------------- */
app.post("/ocorrencias/create", async (req, res) => {
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

    if (!booking || !tipo_ocorrencia || !descricao) {
      return res.status(400).json({
        success: false,
        error: "missing_fields",
        message: "Booking, tipo e descrição são obrigatórios"
      });
    }

    const { data, error } = await supabase
      .from("ocorrencias")
      .insert({
        booking,
        container: container || null,
        embarcador_nome: embarcador_nome || "Não informado",
        porto: porto || null,
        previsao_inicio_atendimento: previsao_original || null,
        tipo_ocorrencia,
        descricao_ocorrencia: descricao,
        nova_previsao: nova_previsao || null,
        status: 'pendente',
        criado_por: 'Formulário Público'
      })
      .select()
      .single();

    if (error) throw error;

    console.log("✅ Ocorrência pública criada:", data);

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
    const status = req.query.status || 'all';

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
   ✅ OCORRÊNCIAS - ATUALIZAR STATUS (CORRIGIDO)
------------------------------------------------- */
app.post("/admin/ocorrencias/updateStatus", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const { id, status } = req.body;

    if (!id || !status) {
      return res.status(400).json({
        success: false,
        error: "missing_params",
        message: "ID e status são obrigatórios"
      });
    }

    // ✅ Estados permitidos
    const estadosPermitidos = ['pendente', 'em_analise', 'cliente_notificado', 'processada', 'rejeitada'];

    if (!estadosPermitidos.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "invalid_status",
        message: `Status deve ser um de: ${estadosPermitidos.join(', ')}`
      });
    }

    const { data, error } = await supabase
      .from("ocorrencias")
      .update({
        status: status,
        data_processamento: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Erro ao atualizar ocorrência:", error);
      throw error;
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "ocorrencia_not_found",
        message: "Ocorrência não encontrada"
      });
    }

    console.log(`✅ Ocorrência atualizada para '${status}':`, data);

    return res.json({
      success: true,
      message: `Ocorrência marcada como '${status}' com sucesso`,
      ocorrencia: data
    });
  } catch (err) {
    console.error("❌ /admin/ocorrencias/updateStatus error:", err);
    return res.status(500).json({
      success: false,
      error: "server_error_update_occurrence",
      details: err.message
    });
  }
});

/* -------------------------------------------------
   ✅ NOVA ROTA - Deletar ocorrência
------------------------------------------------- */
app.delete("/admin/ocorrencias/delete", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "missing_id",
        message: "ID é obrigatório"
      });
    }

    const { error } = await supabase
      .from("ocorrencias")
      .delete()
      .eq("id", id);

    if (error) throw error;

    console.log(`✅ Ocorrência deletada: ${id}`);

    return res.json({
      success: true,
      message: "Ocorrência deletada com sucesso"
    });
  } catch (err) {
    console.error("❌ /admin/ocorrencias/delete error:", err);
    return res.status(500).json({
      success: false,
      error: "server_error_delete_occurrence",
      details: err.message
    });
  }
});

/* -------------------------------------------------
   ✅ NOVO: GERAR EMAIL DE NOTIFICAÇÃO DE OCORRÊNCIA
------------------------------------------------- */
app.post("/admin/ocorrencias/generateEmail", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, error: "missing_id" });
    }

    // Buscar ocorrência
    const { data: ocorrencia, error } = await supabase
      .from("ocorrencias")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !ocorrencia) {
      return res.status(404).json({
        success: false,
        error: "ocorrencia_not_found",
        message: "Ocorrência não encontrada"
      });
    }

    // Buscar embarcador para pegar email
    let emailDestinatario = '';
    if (ocorrencia.embarcador_nome) {
      const { data: embarcador } = await supabase
        .from("embarcadores")
        .select("email, contato_email")
        .eq("nome_principal", ocorrencia.embarcador_nome)
        .single();

      emailDestinatario = embarcador?.email || embarcador?.contato_email || '';
    }

    // Formatação de dados
    const tipoOcorrenciaFormatado = ocorrencia.tipo_ocorrencia || 'Não especificado';
    const dataRegistro = isoToBR(ocorrencia.data_criacao) || 'N/A';
    const previsaoOriginal = isoToBR(ocorrencia.previsao_inicio_atendimento) || 'N/A';
    const novaPrevisao = isoToBR(ocorrencia.nova_previsao) || 'Sem nova previsão';

    // ✅ Gerar conteúdo do email em formato .eml
    const emlContent = `From: Mercosul Line <noreply@mercosulline.com.br>
To: ${emailDestinatario || 'cliente@exemplo.com'}
Subject: [URGENTE] Ocorrência Registrada - Booking ${ocorrencia.booking}
MIME-Version: 1.0
Content-Type: text/html; charset=UTF-8
Date: ${new Date().toUTCString()}

<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 10px 10px 0 0;
            text-align: center;
        }
        .content {
            background: #f9f9f9;
            padding: 30px;
            border: 1px solid #ddd;
            border-top: none;
            border-radius: 0 0 10px 10px;
        }
        .alert-box {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
        }
        .info-table {
            width: 100%;
            background: white;
            border-radius: 5px;
            overflow: hidden;
            margin: 20px 0;
        }
        .info-table tr {
            border-bottom: 1px solid #eee;
        }
        .info-table td {
            padding: 12px;
        }
        .info-table td:first-child {
            font-weight: bold;
            width: 40%;
            background: #f5f5f5;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            color: #666;
            font-size: 12px;
        }
        .urgent {
            color: #d32f2f;
            font-weight: bold;
            font-size: 1.1em;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚨 NOTIFICAÇÃO DE OCORRÊNCIA</h1>
        <p>Sistema de Rastreamento Mercosul Line</p>
    </div>
    
    <div class="content">
        <div class="alert-box">
            <p class="urgent">⚠️ Uma ocorrência foi registrada para sua operação</p>
        </div>
        
        <p>Prezado(a) <strong>${ocorrencia.embarcador_nome}</strong>,</p>
        
        <p>Informamos que foi registrada uma ocorrência referente à operação abaixo:</p>
        
        <table class="info-table">
            <tr>
                <td>📦 Booking</td>
                <td><strong>${ocorrencia.booking}</strong></td>
            </tr>
            <tr>
                <td>📋 Container</td>
                <td>${ocorrencia.container || 'N/A'}</td>
            </tr>
            <tr>
                <td>🏭 Porto</td>
                <td>${ocorrencia.porto || 'N/A'}</td>
            </tr>
            <tr>
                <td>⚠️ Tipo de Ocorrência</td>
                <td><strong>${tipoOcorrenciaFormatado}</strong></td>
            </tr>
            <tr>
                <td>📅 Data do Registro</td>
                <td>${dataRegistro}</td>
            </tr>
            <tr>
                <td>📅 Previsão Original</td>
                <td>${previsaoOriginal}</td>
            </tr>
            <tr>
                <td>📅 Nova Previsão</td>
                <td><strong style="color: #d32f2f;">${novaPrevisao}</strong></td>
            </tr>
        </table>
        
        <div style="background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1976d2;">📝 Descrição da Ocorrência:</h3>
            <p style="margin: 0;">${ocorrencia.descricao_ocorrencia || 'Sem descrição'}</p>
        </div>
        
        <p style="margin-top: 30px;">
            <strong>Ações Necessárias:</strong>
        </p>
        <ul>
            <li>Acompanhar o status atualizado da operação</li>
            <li>Contatar nosso time comercial em caso de dúvidas</li>
            <li>Ajustar planejamento interno conforme nova previsão</li>
        </ul>
        
        <p style="margin-top: 30px;">
            Para mais detalhes ou esclarecimentos, entre em contato conosco através dos nossos canais de atendimento.
        </p>
        
        <p style="margin-top: 20px;">
            Atenciosamente,<br>
            <strong>Equipe Mercosul Line</strong>
        </p>
    </div>
    
    <div class="footer">
        <p>Este é um email automático, por favor não responda.</p>
        <p>Mercosul Line - Sistema de Rastreamento de Operações</p>
        <p>© ${new Date().getFullYear()} Todos os direitos reservados</p>
    </div>
</body>
</html>`;

    // Retornar conteúdo do .eml
    return res.json({
      success: true,
      message: "Email gerado com sucesso",
      emailContent: emlContent,
      ocorrencia: {
        id: ocorrencia.id,
        booking: ocorrencia.booking,
        embarcador: ocorrencia.embarcador_nome,
        destinatario: emailDestinatario
      }
    });
  } catch (err) {
    console.error("❌ /admin/ocorrencias/generateEmail error:", err);
    return res.status(500).json({
      success: false,
      error: "server_error_generate_email",
      details: err.message
    });
  }
});

// server.js — deixe APENAS essa versão
function calcularAtrasoLocal(op) {
  // Previsão obrigatória
  const prevStr = op.previsao_inicio_atendimento || op.dt_previsao_inicio_atendimento;
  if (!prevStr) return 0;

  const prev = new Date(prevStr);
  const real = op.dt_inicio_execucao ? new Date(op.dt_inicio_execucao) : new Date();

  const diffMin = Math.floor((real - prev) / 60000); // minutos
  return diffMin > 0 ? diffMin : 0; // sem tolerância Manaus
}

/* -------------------------------------------------
   ✅ CORREÇÃO: ANALYTICS KPIs (Mantendo lógica original + Novos Gráficos)
------------------------------------------------- */
app.get("/admin/analytics/kpis", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const { embarcador_id, data_inicio, data_fim } = req.query;

    let totalAbsolutoBanco = 0;
    
    // Contagem rápida total se não houver filtro
    if (!embarcador_id && !data_inicio && !data_fim) {
        const { count } = await supabase.from("operacoes").select("*", { count: "exact", head: true });
        totalAbsolutoBanco = count;
    }

    let allOperacoes = [];
    let currentPage = 0;
    let hasMore = true;
    const pageSize = 1000;

    const targetMap = {};
    const motivosMap = {};

    while (hasMore) {
      const from = currentPage * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("operacoes")
        .select(`
          id, booking, containers, tipo_programacao,
          previsao_inicio_atendimento, dt_inicio_execucao,
          embarcador_id, motivo_atraso, justificativa_atraso, status_operacao,
          embarcadores (nome_principal)
        `)
        .order("id", { ascending: false })
        .range(from, to);

      if (embarcador_id && embarcador_id !== 'all') {
        const ids = embarcador_id.split(',').map(id => parseInt(id.trim())).filter(Boolean);
        if (ids.length > 0) query = query.in("embarcador_id", ids);
      }
      if (data_inicio) query = query.gte("previsao_inicio_atendimento", data_inicio);
      if (data_fim) query = query.lte("previsao_inicio_atendimento", data_fim);

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        data.forEach(op => {
            const status = (op.status_operacao || '').toLowerCase();
            const isCanceled = status.includes('cancelad');
            const atrasoCalc = calcularAtrasoLocal(op);
            const noPrazo = atrasoCalc <= 0;

            // ✅ CORREÇÃO CRÍTICA: Contagem de Motivos com normalização IGUAL ao frontend
            if (!isCanceled && !noPrazo) {
                // Prioriza justificativa_atraso pois é onde o upload salva o dado da planilha
                let m = op.justificativa_atraso || op.motivo_atraso || 'sem justificativa';
                m = m.toString().trim();
                
                // Normalização para agrupar "sem justificativa", "-", etc
                if (m === '-' || m === '' || m.toLowerCase() === 'null') {
                    m = 'sem justificativa';
                }
                
                // ✅ CRÍTICO: Padronizar para minúsculas IGUAL ao frontend (admin.js linha 481)
                m = m.toLowerCase();

                motivosMap[m] = (motivosMap[m] || 0) + 1;
            }

            // Target Chart
            if (!isCanceled && op.previsao_inicio_atendimento) {
                const d = new Date(op.previsao_inicio_atendimento);
                const mesKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
                if (!targetMap[mesKey]) targetMap[mesKey] = { cTotal:0, cOk:0, eTotal:0, eOk:0 };

                const tipo = (op.tipo_programacao || '').toLowerCase();
                if (tipo.includes('colet') || tipo.includes('ova')) {
                    targetMap[mesKey].cTotal++;
                    if (noPrazo) targetMap[mesKey].cOk++;
                } else {
                    targetMap[mesKey].eTotal++;
                    if (noPrazo) targetMap[mesKey].eOk++;
                }
            }
        });

        allOperacoes = allOperacoes.concat(data);
        if (data.length < pageSize) hasMore = false;
        currentPage++;
        if(currentPage > 200) hasMore = false; 
      }
    }

    const totalExibido = totalAbsolutoBanco > 0 ? totalAbsolutoBanco : allOperacoes.length;

    // Filtros para os KPIs
    const validOps = allOperacoes.filter(op => !((op.status_operacao || '').toLowerCase().includes('cancelad')));
    const baseTotal = validOps.length > 0 ? validOps.length : 1;

    const coletas = validOps.filter(op => (op.tipo_programacao || '').toLowerCase().includes('colet'));
    const entregas = validOps.filter(op => (op.tipo_programacao || '').toLowerCase().includes('entreg'));

    // Arrays para pontualidade
    const no_prazo = [], ate_1h = [], de_2_a_5h = [], de_5_a_10h = [], mais_10h = [];

    validOps.forEach(op => {
        const delay = calcularAtrasoLocal(op);
        if (delay <= 0) no_prazo.push(op);
        else if (delay <= 60) ate_1h.push(op);
        else if (delay <= 300) de_2_a_5h.push(op);
        else if (delay <= 600) de_5_a_10h.push(op);
        else mais_10h.push(op);
    });

    const calcPct = (parte, todo) => ((parte / todo) * 100).toFixed(1);

    const targetChartData = Object.keys(targetMap).sort().map(key => {
        const d = targetMap[key];
        return {
            mes: key,
            coletaPct: d.cTotal > 0 ? calcPct(d.cOk, d.cTotal) : '100.0',
            entregaPct: d.eTotal > 0 ? calcPct(d.eOk, d.eTotal) : '100.0'
        };
    });

    const motivosArray = Object.entries(motivosMap)
        .map(([motivo, quantidade]) => ({ 
            motivo, 
            quantidade, 
            percentual: calcPct(quantidade, baseTotal) 
        }))
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 12); // Top 12

    // ✅ CORREÇÃO: Mapeamento completo (TODAS operações + embarcador)
    const simpleMap = (arr) => arr.map(o => ({ 
        id: o.id, 
        booking: o.booking, 
        container: o.containers,
        embarcador_nome: o.embarcadores?.nome_principal || 'Não informado',
        motivo_atraso: o.justificativa_atraso || o.motivo_atraso 
    }));

    return res.json({
      success: true,
      data: {
        resumo: {
          total_operacoes: totalExibido,
          total_coletas: coletas.length,
          total_entregas: entregas.length
        },
        pontualidade_geral: {
          no_prazo: { quantidade: no_prazo.length, percentual: calcPct(no_prazo.length, baseTotal), operacoes: simpleMap(no_prazo) },
          ate_1h: { quantidade: ate_1h.length, percentual: calcPct(ate_1h.length, baseTotal), operacoes: simpleMap(ate_1h) },
          de_2_a_5h: { quantidade: de_2_a_5h.length, percentual: calcPct(de_2_a_5h.length, baseTotal), operacoes: simpleMap(de_2_a_5h) },
          de_5_a_10h: { quantidade: de_5_a_10h.length, percentual: calcPct(de_5_a_10h.length, baseTotal), operacoes: simpleMap(de_5_a_10h) },
          mais_10h: { quantidade: mais_10h.length, percentual: calcPct(mais_10h.length, baseTotal), operacoes: simpleMap(mais_10h) }
        },
        pontualidade_coletas: {
            media: coletas.length > 0 ? calcPct(coletas.filter(o => calcularAtrasoLocal(o)<=0).length, coletas.length) : '0.0',
            total: coletas.length,
            no_prazo: coletas.filter(o => calcularAtrasoLocal(o)<=0).length
        },
        pontualidade_entregas: {
            media: entregas.length > 0 ? calcPct(entregas.filter(o => calcularAtrasoLocal(o)<=0).length, entregas.length) : '0.0',
            total: entregas.length,
            no_prazo: entregas.filter(o => calcularAtrasoLocal(o)<=0).length
        },
        motivos_atraso: motivosArray,
        target_chart: targetChartData
      }
    });

  } catch (err) {
    console.error("Analytics Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});


app.put("/admin/ferrovia/operacao/:id/mover-terminal", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    // Atualiza status e data de entrada
    const { data, error } = await supabase
      .from('operacoes_ferrovia')
      .update({ 
        status: 'terminal_apoio', 
        dt_entrada_terminal_apoio: new Date().toISOString() 
      })
      .eq('id', id)
      .select();
    
    if(error) throw error;
    res.json({ success: true, message: "Movido para Terminal de Apoio", data });
  } catch (e) {
    console.error(e); res.status(500).json({success: false, error: e.message});
  }
});

// Mover de Terminal -> Entrega (Saída)
app.put("/admin/ferrovia/operacao/:id/mover-entrega", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { data, error } = await supabase
      .from('operacoes_ferrovia')
      .update({ 
        status: 'aguardando_entrega', 
        dt_saida_terminal_apoio: new Date().toISOString() 
      })
      .eq('id', id)
      .select();
      
    if(error) throw error;
    res.json({ success: true, message: "Saiu para Entrega", data });
  } catch (e) {
    console.error(e); res.status(500).json({success: false, error: e.message});
  }
});

// server.js (Adicionar no final)

app.put("/admin/ferrovia/operacao/:id/chegada-porto", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
    const id = req.params.id;
    // Atualiza status e data real de chegada no porto
    const { error } = await supabase
        .from('operacoes_ferrovia')
        .update({ 
            status: 'no_porto', 
            dt_chegada_porto: new Date().toISOString() 
        })
        .eq('id', id);
        
    if(error) return res.status(500).json({success:false, error: error.message});
    res.json({success:true});
});

// Dar Baixa (Finalizar)
app.put("/admin/ferrovia/operacao/:id/baixa", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { data, error } = await supabase
      .from('operacoes_ferrovia')
      .update({ 
        status: 'entregue', 
        dt_entrega: new Date().toISOString() 
      })
      .eq('id', id)
      .select();

    if(error) throw error;
    res.json({ success: true, message: "Operação Finalizada", data });
  } catch (e) {
    console.error(e); res.status(500).json({success: false, error: e.message});
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
  console.log(`   POST /auth/register - Registro`);
  console.log(`   GET  /admin/pendingUsers - Listar pendentes`);
  console.log(`   POST /admin/approveUser - Aprovar`);
  console.log(`   POST /admin/rejectUser - Rejeitar`);
  console.log(`   GET  /admin/allOps - Todas operações`);
  console.log(`   POST /admin/importOperations - Upload`);
  console.log(`   GET  /admin/embarcadores - Listar embarcadores`);
  console.log(`   GET  /portal/myOps - Operações do embarcador`);
  console.log(`   POST /ocorrencias/create - Criar ocorrência`);
  console.log(`   GET  /admin/ocorrencias - Listar ocorrências`);
  console.log(`   POST /admin/ocorrencias/updateStatus - Atualizar status`);
  console.log(`   POST /admin/ocorrencias/generateEmail - Gerar email`);
  console.log(`   GET  /admin/analytics/kpis - KPIs e analytics`);
});


// ======= FERROVIA - utilidades =======
app.delete("/admin/ferrovia/operacoes", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM historico_ferrovia");
    await pool.query("DELETE FROM operacoes_ferrovia");
    res.json({ success: true, cleared: true });
  } catch (e) {
    console.error(e); res.status(500).json({ success: false, error: "server_error_clear" });
  }
});

app.put("/admin/ferrovia/operacao/:id/terminal/saida", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { previsao_entrega } = req.body || {};
    const q = await pool.query(`UPDATE operacoes_ferrovia
      SET dt_saida_terminal_apoio = NOW(),
          status = 'aguardando_entrega',
          dt_previsao_entrega = COALESCE($1, dt_previsao_entrega),
          updated_at = NOW(), updated_by = $2
      WHERE id=$3 RETURNING *`,
      [previsao_entrega || null, req.appUser?.id || null, id]);
    if (!q.rowCount) return res.status(404).json({ success: false, error: "not_found" });
    await pool.query(
      `INSERT INTO historico_ferrovia (operacao_id, status_novo, localizacao_nova, observacao, created_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, 'aguardando_entrega', 'cliente', 'Saída do terminal de apoio', req.appUser?.id || null]
    );
    res.json({ success: true, operacao: q.rows[0] });
  } catch (e) { console.error(e); res.status(500).json({ success: false, error: "server_error_terminal_saida" }); }
});

// ✅ NOVA ROTA: Stats da ferrovia (KPIs do dashboard)
app.get("/admin/ferrovia/stats", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    // Conta operações por status
    const statsQuery = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'no_porto') as no_porto,
        COUNT(*) FILTER (WHERE status = 'terminal_apoio') as terminal_apoio,
        COUNT(*) FILTER (WHERE status = 'em_transito') as em_transito,
        COUNT(*) FILTER (WHERE status = 'entregue' AND 
          EXTRACT(MONTH FROM dt_entrega) = EXTRACT(MONTH FROM CURRENT_DATE) AND
          EXTRACT(YEAR FROM dt_entrega) = EXTRACT(YEAR FROM CURRENT_DATE)
        ) as entregues_mes
      FROM operacoes_ferrovia
    `);

    const stats = statsQuery.rows[0] || {
      no_porto: 0,
      terminal_apoio: 0,
      em_transito: 0,
      entregues_mes: 0
    };

    res.json({ success: true, stats });
  } catch (e) {
    console.error('Erro em /admin/ferrovia/stats:', e);
    res.status(500).json({ success: false, error: "server_error_ferrovia_stats" });
  }
});


// server.js - Rota de Detalhes Ferrovia

app.get("/admin/ferrovia/operacoes_detalhe", verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    // Usando Supabase para consistência com o resto
    const { data, error } = await supabase
      .from('operacoes_ferrovia')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Calcula dias no servidor para facilitar
    const items = data.map(op => {
      const hoje = new Date();
      
      // Dias no Porto
      let diasPorto = 0;
      if (op.dt_chegada_porto) {
        const fim = op.dt_entrada_terminal_apoio ? new Date(op.dt_entrada_terminal_apoio) : hoje;
        const inicio = new Date(op.dt_chegada_porto);
        diasPorto = Math.floor((fim - inicio) / (1000 * 60 * 60 * 24));
      }

      // Dias no Terminal (CORRIGIDO: usa dt_entrada_terminal_apoio)
      let diasTerminal = 0;
      if (op.dt_entrada_terminal_apoio) {
        const fim = op.dt_saida_terminal_apoio ? new Date(op.dt_saida_terminal_apoio) : hoje;
        const inicio = new Date(op.dt_entrada_terminal_apoio);
        diasTerminal = Math.floor((fim - inicio) / (1000 * 60 * 60 * 24));
      }

      return {
        ...op,
        dias_no_porto: diasPorto > 0 ? diasPorto : 0,
        dias_no_terminal: diasTerminal > 0 ? diasTerminal : 0
      };
    });

    res.json({ success: true, items });
  } catch (e) { 
    console.error('Erro detalhe ferrovia:', e); 
    res.status(500).json({ success: false, error: "server_error_list_detalhe" }); 
  }
});

// server.js - Rota de Importação Ferrovia CORRIGIDA E INTELIGENTE

// server.js - Rota de Importação Ferrovia COMPLETA

app.post('/admin/ferrovia/import', upload.single('file'),
  verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
    try {
      console.log('📤 Recebendo upload de ferrovia (Schema Completo)');

      if (!req.file) return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });

      const XLSX = require('xlsx');
      const workbook = XLSX.read(req.file.buffer);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(worksheet);

      if (data.length === 0) return res.status(400).json({ success: false, error: 'Planilha vazia' });

      const operacoesParaInserir = [];

      for (const row of data) {
        // Helper para ler datas
        const lerData = (campo) => brToISO(row[campo]);

        // Mapeamento das datas do Excel para variáveis
        const dt_prev_chegada = lerData('Prev. Chegada Porto') || lerData('Previsão Chegada Porto');
        const dt_chegada = lerData('Data Chegada Porto');
        const dt_entrada_term = lerData('Data Entrada Terminal');
        const dt_saida_term = lerData('Data Saída Terminal');
        const dt_inicio_transito = lerData('Data Início Trânsito');
        const dt_prev_entrega = lerData('Prev. Entrega') || lerData('Previsão Entrega');
        const dt_entrega = lerData('Data Entrega');

        // Lógica de Status Automático (Hierarquia inversa: do fim para o começo)
        let statusCalculado = 'aguardando_chegada';

        if (dt_entrega) {
          statusCalculado = 'entregue';
        } else if (dt_inicio_transito || dt_saida_term) {
          // Se saiu do terminal ou iniciou trânsito
          statusCalculado = 'em_transito';
        } else if (dt_entrada_term) {
          statusCalculado = 'terminal_apoio';
        } else if (dt_chegada) {
          statusCalculado = 'no_porto';
        }

        // Objeto alinhado com o schema 'operacoes_ferrovia'
        const operacao = {
          booking: row['Booking'] || row['booking'],
          container: row['Container'] || row['container'],
          tipo_container: row['Tipo Container'] || row['Tipo'],
          embarcador_nome: row['Embarcador'] || row['Cliente'],
          mercadoria: row['Mercadoria'],
          peso_bruto: row['Peso (ton)'] || row['Peso'] ? parseFloat(row['Peso (ton)'] || row['Peso']) : null,
          origem: row['Origem'],
          destino: row['Destino'],
          companhia_ferroviaria: row['Cia Ferroviária'],
          numero_vagao: row['Vagão'],

          // Datas mapeadas
          dt_previsao_chegada_porto: dt_prev_chegada,
          dt_chegada_porto: dt_chegada,
          dt_entrada_terminal_apoio: dt_entrada_term,
          dt_saida_terminal_apoio: dt_saida_term,
          dt_inicio_transito: dt_inicio_transito,
          dt_previsao_entrega: dt_prev_entrega,
          dt_entrega: dt_entrega,

          prioridade: (row['Prioridade'] || 'normal').toLowerCase(),
          observacoes: row['Observações'] || row['Observacoes'],
          status: statusCalculado,

          created_by: req.appUser ? req.appUser.id : null,
          updated_at: new Date().toISOString() // Força atualização do timestamp
        };

        if (!operacao.booking || !operacao.container) {
          // Pula linhas inválidas sem identificador
          continue;
        }

        operacoesParaInserir.push(operacao);
      }

      // Upsert usando a constraint única criada (booking, container)
      const { data: inserted, error } = await supabase
        .from('operacoes_ferrovia')
        .upsert(operacoesParaInserir, {
          onConflict: 'booking, container',
          ignoreDuplicates: false // Garante que vai atualizar se existir
        })
        .select();

      if (error) {
        console.error('Erro banco:', error);
        throw error;
      }

      return res.json({
        success: true,
        imported: inserted.length,
        message: `${inserted.length} operações processadas com sucesso.`
      });

    } catch (error) {
      console.error('❌ Erro upload ferrovia:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

// server.js - Nova Rota de Relatório

app.get('/admin/ferrovia/relatorio', verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
  try {
    const periodo = parseInt(req.query.periodo) || 7;

    // Data limite = Hoje + X dias
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() + periodo);
    const dataLimiteISO = dataLimite.toISOString();

    // Busca operações com previsão de chegada próxima E que ainda não chegaram (ou chegaram recentemente)
    const { data, error } = await supabase
      .from('operacoes_ferrovia')
      .select('*')
      .lte('dt_previsao_chegada_porto', dataLimiteISO) // Menor ou igual a data limite
      .order('dt_previsao_chegada_porto', { ascending: true });

    if (error) throw error;

    return res.json({
      success: true,
      operacoes: data || []
    });

  } catch (err) {
    console.error('❌ Erro relatório ferrovia:', err);
    return res.status(500).json({ success: false, error: 'Erro ao gerar relatório' });
  }
});

// Helper necessário se não existir (reutilize o do server.js se já tiver)
function brToISO(val) {
  if (!val) return null;
  // Se for data Excel (número)
  if (typeof val === 'number') {
    // Excel começa em 30/12/1899
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    // Corrige fuso horário se necessário, ou retorna ISO simples
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  // Se for string dd/mm/yyyy hh:mm
  if (typeof val === 'string') {
    const parts = val.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
    if (parts) {
      const [_, d, m, y, h = '00', min = '00'] = parts;
      const date = new Date(`${y}-${m}-${d}T${h}:${min}:00`);
      return isNaN(date.getTime()) ? null : date.toISOString();
    }
  }
  return null;
}

// Funções auxiliares para normalização
function normalizarStatus(status) {
  const statusMap = {
    'aguardando': 'aguardando_chegada',
    'no porto': 'no_porto',
    'terminal': 'terminal_apoio',
    'transito': 'em_transito',
    'aguardando entrega': 'aguardando_entrega',
    'entregue': 'entregue',
    'cancelado': 'cancelado'
  };

  const statusLower = status.toLowerCase();
  for (const [key, value] of Object.entries(statusMap)) {
    if (statusLower.includes(key)) return value;
  }
  return 'aguardando_chegada';
}

function normalizarPrioridade(prioridade) {
  const prioridadeLower = prioridade.toLowerCase();
  if (prioridadeLower.includes('urgente')) return 'urgente';
  if (prioridadeLower.includes('alta')) return 'alta';
  if (prioridadeLower.includes('baixa')) return 'baixa';
  return 'normal';
}

// server.js - Rota de Prioridades CORRIGIDA

app.post('/admin/prioridades/import', upload.single('file'),
  verifyTokenAndAttachUser, requireAdmin, async (req, res) => {
    try {
      console.log('📤 Recebendo upload de prioridades Amcor');

      if (!req.file) return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });

      // 1. Ler Arquivo
      const XLSX = require('xlsx');
      const workbook = XLSX.read(req.file.buffer);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      if (data.length === 0) return res.status(400).json({ success: false, error: 'Planilha vazia' });

      // 2. Busca o ID do embarcador Amcor (Opcional: se não achar, segue sem ID)
      let embarcadorAmcorId = null;
      const { data: amcor } = await supabase
        .from('embarcadores')
        .select('id')
        .ilike('nome_principal', '%amcor%')
        .limit(1)
        .maybeSingle(); // Usa maybeSingle para não dar erro se não achar

      if (amcor) embarcadorAmcorId = amcor.id;

      // 3. Processar linhas
      let atualizadas = 0;

      for (const row of data) {
        const container = row['Container'] || row['container'];
        const booking = row['Booking'] || row['booking'];
        const prioridadeRaw = row['Prioridade'] || row['prioridade'] || 'alta';

        if (!container && !booking) continue;

        // Normaliza prioridade
        const prioridade = prioridadeRaw.toLowerCase();
        // (urgente, alta, normal, baixa)

        // Monta query de busca na tabela CORRETA
        let query = supabase.from('operacoes_ferrovia').select('id');

        // Filtra por Container OU Booking
        if (container) {
          query = query.eq('container', container); // ✅ Corrigido de 'containers' para 'container'
        } else if (booking) {
          query = query.eq('booking', booking);
        }

        const { data: ops, error } = await query;

        if (!error && ops && ops.length > 0) {
          // Atualiza todas as operações encontradas
          for (const op of ops) {
            const updatePayload = { prioridade };
            if (embarcadorAmcorId) updatePayload.embarcador_id = embarcadorAmcorId;

            const { error: updateError } = await supabase
              .from('operacoes_ferrovia') // ✅ Tabela correta
              .update(updatePayload)
              .eq('id', op.id);

            if (!updateError) atualizadas++;
          }
        }
      }

      return res.json({
        success: true,
        imported: atualizadas,
        message: `${atualizadas} prioridades atualizadas com sucesso`
      });

    } catch (error) {
      console.error('❌ Erro prioridades:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });