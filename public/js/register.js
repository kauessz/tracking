import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const emailInput = document.getElementById('register-email');
    const passwordInput = document.getElementById('register-password');
    const registerButton = document.getElementById('register-button');
    const errorMsg = document.getElementById('register-error');
    const successMsg = document.getElementById('register-success');

    const handleRegister = async (auth, db) => {
        const email = emailInput.value;
        const password = passwordInput.value;
        const accountType = document.querySelector('input[name="account_type"]:checked').value;

        errorMsg.classList.add('hidden');
        successMsg.classList.add('hidden');

        if (!email || !password) {
            errorMsg.textContent = "Por favor, preencha todos os campos.";
            errorMsg.classList.remove('hidden');
            return;
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            const userDocRef = doc(db, "users", user.uid);
            await setDoc(userDocRef, {
                email: user.email,
                status: "pending",
                role: "pending",
                accountType: accountType,
                registeredAt: new Date()
            });

            successMsg.textContent = "Pedido de registo enviado! A sua conta precisa de ser aprovada por um administrador.";
            successMsg.classList.remove('hidden');
            emailInput.value = '';
            passwordInput.value = '';

        } catch (error) {
            console.error("Erro de registo:", error.code, error.message);
            switch (error.code) {
                case 'auth/email-already-in-use':
                    errorMsg.textContent = "Este e-mail já está em uso.";
                    break;
                case 'auth/invalid-email':
                    errorMsg.textContent = "O formato do e-mail é inválido.";
                    break;
                case 'auth/weak-password':
                    errorMsg.textContent = "A senha é muito fraca. Use pelo menos 6 caracteres.";
                    break;
                default:
                    errorMsg.textContent = "Ocorreu um erro ao criar a conta.";
            }
            errorMsg.classList.remove('hidden');
        }
    };

    try {
        const config = JSON.parse(__firebase_config);
        const app = initializeApp(config);
        const auth = getAuth(app);
        const db = getFirestore(app);
        
        registerButton.addEventListener('click', () => handleRegister(auth, db));
        passwordInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') handleRegister(auth, db);
        });

    } catch (error) {
        console.error("Erro ao inicializar a página de registo:", error);
    }
});