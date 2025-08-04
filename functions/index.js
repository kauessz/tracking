// index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * Trigger que é executado sempre que um documento de utilizador é atualizado.
 * Sincroniza o 'role' e 'accountType' do Firestore para os Custom Claims de autenticação do Firebase.
 */
exports.setUserClaimsOnUpdate = functions.firestore
  .document("users/{userId}")
  .onUpdate(async (change, context) => {
    const userId = context.params.userId;
    const newData = change.after.data();
    const oldData = change.before.data();

    // Extrai o 'role' e 'accountType' do documento atualizado.
    const newRole = newData.role;
    const newAccountType = newData.accountType;

    // Se os campos não mudaram, não faz nada.
    if (oldData.role === newRole && oldData.accountType === newAccountType) {
      functions.logger.log(`No change in claims for user ${userId}.`);
      return null;
    }

    try {
      // Define os custom claims no token de autenticação do utilizador.
      await admin.auth().setCustomUserClaims(userId, {
        role: newRole,
        accountType: newAccountType,
      });
      functions.logger.log(
        `Successfully set claims for user ${userId}:`,
        { role: newRole, accountType: newAccountType },
      );
      return { result: `Claims updated for ${userId}.` };
    } catch (error) {
      functions.logger.error(
        `Error setting custom claims for user ${userId}:`,
        error,
      );
      return { error: "Failed to set custom claims." };
    }
  });