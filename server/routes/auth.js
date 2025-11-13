// server/routes/auth.js
// --------------------------------------------------
// ROTAS DE AUTENTICAÇÃO - VERSÃO CORRIGIDA
// 
// Esta versão garante que novos usuários sejam
// automaticamente inseridos na tabela 'usuarios'
// --------------------------------------------------

const express = require('express');
const router = express.Router();
const { supabase } = require('../supabaseClient');
const { authGuard } = require('../authMiddleware');
const admin = require('firebase-admin');

// --------------------------------------------------
// POST /auth/register
// Registra um novo usuário na tabela 'usuarios'
// Chamado após criar usuário no Firebase Auth
// --------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    const { firebase_uid, email } = req.body;

    if (!firebase_uid || !email) {
      return res.status(400).json({
        success: false,
        error: 'firebase_uid e email são obrigatórios',
      });
    }

    console.log(`[AUTH] Registrando novo usuário: ${email}`);

    // Verifica se já existe
    const { data: existing, error: checkError } = await supabase
      .from('usuarios')
      .select('id, status')
      .eq('firebase_uid', firebase_uid)
      .single();

    if (existing) {
      console.log(`[AUTH] Usuário já existe: ${email} (status: ${existing.status})`);
      return res.json({
        success: true,
        message: 'Usuário já cadastrado',
        user: existing,
      });
    }

    // Insere novo usuário com status 'pendente'
    const { data: newUser, error: insertError } = await supabase
      .from('usuarios')
      .insert({
        firebase_uid,
        email,
        role: 'user', // padrão é user, admin precisa aprovar
        status: 'pendente', // aguarda aprovação
      })
      .select()
      .single();

    if (insertError) {
      console.error('[AUTH] Erro ao inserir usuário:', insertError);
      return res.status(500).json({
        success: false,
        error: 'Erro ao criar usuário no banco',
        details: insertError.message,
      });
    }

    console.log(`[AUTH] Usuário criado com sucesso: ${email}`);

    res.json({
      success: true,
      message: 'Usuário registrado. Aguarde aprovação do administrador.',
      user: newUser,
    });

  } catch (error) {
    console.error('[AUTH] Erro no registro:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno no servidor',
    });
  }
});

// --------------------------------------------------
// GET /auth/whoami
// Retorna informações do usuário autenticado
// Requer Bearer token válido
// --------------------------------------------------
router.get('/whoami', authGuard, async (req, res) => {
  // req.userContext foi preenchido pelo authGuard
  const { firebase_uid, role, embarcador_id, usuario_id } = req.userContext;

  try {
    // Busca informações completas do usuário
    const { data: user, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', usuario_id)
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado',
      });
    }

    // Remove informações sensíveis
    delete user.firebase_uid;

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        embarcador_id: user.embarcador_id,
        created_at: user.created_at,
      },
    });

  } catch (error) {
    console.error('[AUTH] Erro em whoami:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar informações do usuário',
    });
  }
});

// --------------------------------------------------
// POST /auth/check-status
// Verifica o status de aprovação de um usuário
// Usado para mostrar mensagem de "aguardando aprovação"
// --------------------------------------------------
router.post('/check-status', async (req, res) => {
  try {
    const { firebase_uid } = req.body;

    if (!firebase_uid) {
      return res.status(400).json({
        success: false,
        error: 'firebase_uid é obrigatório',
      });
    }

    const { data: user, error } = await supabase
      .from('usuarios')
      .select('id, email, role, status')
      .eq('firebase_uid', firebase_uid)
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado',
        needsRegistration: true,
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });

  } catch (error) {
    console.error('[AUTH] Erro em check-status:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao verificar status',
    });
  }
});

// --------------------------------------------------
// POST /auth/update-profile
// Atualiza informações do perfil do usuário
// --------------------------------------------------
router.post('/update-profile', authGuard, async (req, res) => {
  try {
    const { usuario_id } = req.userContext;
    const updates = req.body;

    // Remove campos que não devem ser atualizados pelo usuário
    delete updates.firebase_uid;
    delete updates.role;
    delete updates.status;
    delete updates.id;

    const { data, error } = await supabase
      .from('usuarios')
      .update(updates)
      .eq('id', usuario_id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Erro ao atualizar perfil',
      });
    }

    res.json({
      success: true,
      user: data,
    });

  } catch (error) {
    console.error('[AUTH] Erro ao atualizar perfil:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno no servidor',
    });
  }
});

module.exports = router;