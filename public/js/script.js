import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    // --- Referências de Elementos do DOM ---
    const trackingInput = document.getElementById('tracking-input');
    const trackingButton = document.getElementById('tracking-button');
    const resultsContainer = document.getElementById('tracking-results');
    const emailInput = document.getElementById('email-input');
    const passwordInput = document.getElementById('password-input');
    const loginButton = document.getElementById('login-button');
    const passwordError = document.getElementById('password-error');
    const toggleDark = document.getElementById('toggle-dark');
    const htmlElement = document.documentElement;

    // --- Estado ---
    let transportData = [];
    let currentPage = 1;
    const resultsPerPage = 5;

    // --- Lógica do Modo Escuro ---
    const applyTheme = () => {
        if (localStorage.getItem('theme') === 'dark') {
            htmlElement.classList.add('dark-mode');
        } else {
            htmlElement.classList.remove('dark-mode');
        }
    };
    const toggleTheme = () => {
        htmlElement.classList.toggle('dark-mode');
        localStorage.setItem('theme', htmlElement.classList.contains('dark-mode') ? 'dark' : 'light');
    };
    applyTheme();
    toggleDark.addEventListener('click', toggleTheme);
    
    // --- Funções de Pesquisa Pública ---
    const displayResults = (results) => {
        resultsContainer.innerHTML = '';
        if (!results || results.length === 0) {
            resultsContainer.innerHTML = '<p class="text-red-500">Nenhum registo encontrado para a sua pesquisa.</p>';
            return;
        }

        const totalPages = Math.ceil(results.length / resultsPerPage);
        const startIndex = (currentPage - 1) * resultsPerPage;
        const endIndex = startIndex + resultsPerPage;
        const paginatedResults = results.slice(startIndex, endIndex);

        paginatedResults.forEach(result => {
            const resultCard = document.createElement('div');
            resultCard.className = 'border-b border-gray-200 dark:border-gray-700 py-4';
            resultCard.innerHTML = `
                <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div><strong>Embarcador:</strong> ${result.Cliente || 'N/A'}</div>
                    <div><strong>Booking:</strong> ${result.Booking || 'N/A'}</div>
                    <div><strong>Container:</strong> ${result.Container || 'N/A'}</div>
                    <div><strong>Tipo Prog.:</strong> ${result.TipoProgramacao || 'N/A'}</div>
                    <div><strong>Previsão Início:</strong> ${result.DataProgramada || 'N/A'}</div>
                    <div><strong>Início Execução:</strong> ${result.DataChegada || 'N/A'}</div>
                    <div><strong>Fim Execução:</strong> ${result.DataSaida || 'N/A'}</div>
                    <div><strong>Previsão Entrega:</strong> ${result.DataPrevisaoEntregaRecalculada || 'N/A'}</div>
                    <div><strong>Motorista:</strong> ${result.NomeMotoristaProgramado || 'N/A'}</div>
                    <div><strong>Carreta:</strong> ${result.PlacaVeiculo || 'N/A'}</div>
                    <div><strong>Reboque:</strong> ${result.PlacaCarreta1 || 'N/A'}</div>
                </div>
            `;
            resultsContainer.appendChild(resultCard);
        });

        // Paginação
        if (totalPages > 1) {
            const paginationDiv = document.createElement('div');
            paginationDiv.className = 'flex justify-between items-center mt-4';
            
            const prevButton = document.createElement('button');
            prevButton.innerText = 'Anterior';
            prevButton.disabled = currentPage === 1;
            prevButton.className = 'px-4 py-2 bg-gray-300 dark:bg-gray-600 rounded disabled:opacity-50';
            prevButton.onclick = () => {
                currentPage--;
                displayResults(results);
            };

            const pageInfo = document.createElement('span');
            pageInfo.innerText = `Página ${currentPage} de ${totalPages}`;
            pageInfo.className = 'text-sm text-gray-700 dark:text-gray-300';

            const nextButton = document.createElement('button');
            nextButton.innerText = 'Próxima';
            nextButton.disabled = currentPage === totalPages;
            nextButton.className = 'px-4 py-2 bg-gray-300 dark:bg-gray-600 rounded disabled:opacity-50';
            nextButton.onclick = () => {
                currentPage++;
                displayResults(results);
            };

            paginationDiv.appendChild(prevButton);
            paginationDiv.appendChild(pageInfo);
            paginationDiv.appendChild(nextButton);
            resultsContainer.appendChild(paginationDiv);
        }
    };

    const handleSearch = () => {
        const query = trackingInput.value.trim().toUpperCase();
        if (!query) {
            resultsContainer.innerHTML = '<p class="text-yellow-500">Por favor, insira um Booking ou Container.</p>';
            return;
        }
        currentPage = 1;
        const results = transportData.filter(item =>
            item.Container?.toUpperCase().includes(query) || item.Booking?.toUpperCase() === query
        );
        displayResults(results);
    };

    // --- Lógica de Login ---
    const handleLogin = async (auth, db) => {
        const email = emailInput.value;
        const password = passwordInput.value;
        if (!email || !password) {
            passwordError.textContent = "Por favor, preencha o e-mail e a senha.";
            passwordError.classList.remove('hidden');
            return;
        }
        passwordError.classList.add('hidden');
        
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists() && userDoc.data().status === 'approved') {
                const userRole = userDoc.data().role;
                if (userRole === 'admin') {
                    window.location.href = 'admin.html';
                } else if (userRole === 'embarcador') {
                    window.location.href = 'portal.html';
                } else {
                    passwordError.textContent = "A sua conta foi aprovada, mas não tem uma função definida. Contacte o suporte.";
                    passwordError.classList.remove('hidden');
                    await signOut(auth);
                }
            } else {
                let message = "A sua conta ainda não foi aprovada por um administrador.";
                if (userDoc.exists() && userDoc.data().status === 'rejected') {
                    message = "O seu pedido de acesso foi rejeitado.";
                } else if (!userDoc.exists()) {
                    message = "Erro: Não foi encontrado um registo de aprovação para esta conta.";
                }
                passwordError.textContent = message;
                passwordError.classList.remove('hidden');
                await signOut(auth);
            }
        } catch (error) {
            passwordError.textContent = "E-mail ou senha incorretos.";
            passwordError.classList.remove('hidden');
        }
    };

    // --- Lógica Principal da Aplicação ---
    const main = async () => {
        try {
            const config = JSON.parse(__firebase_config);
            const app = initializeApp(config);
            const db = getFirestore(app);
            const auth = getAuth(app);
            
            loginButton.addEventListener('click', () => handleLogin(auth, db));
            passwordInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleLogin(auth, db); });
            trackingButton.addEventListener('click', handleSearch);
            trackingInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleSearch(); });
            
            // ✅ CORREÇÃO: Usar o caminho simplificado que corresponde às regras de segurança.
            const dataRef = doc(db, 'tracking_data', 'latest');

            onSnapshot(dataRef, (docSnap) => {
                if (docSnap.exists()) {
                    transportData = docSnap.data().records || [];
                }
            }, (error) => {
                console.error("Erro ao carregar dados de rastreamento:", error);
                resultsContainer.innerHTML = '<p class="text-red-500">Erro ao carregar dados em tempo real.</p>';
            });
        } catch (error) {
            console.error("Erro ao inicializar a aplicação:", error);
        }
    };

    main();
});