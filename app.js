// ==========================================
// 1. CONFIGURAÇÕES & DADOS SEMENTE
// ==========================================
const TARGET_DATE = new Date('2026-12-31');
const WEEKLY_TARGETS = [72.0, 71.6, 71.2, 70.8, 70.4, 70.0, 69.6, 69.2, 68.8, 68.4, 68.0, 67.5, 67.2, 66.9, 66.7]; // Ref Set-Dez 2026
const START_DATE = new Date('2026-09-16');

const WORKOUT_TEMPLATES = {
    1: [{ name: "Supino Reto", sets: "4x6" }, { name: "Crossover Alta", sets: "4x5" }, { name: "Pullover Polia Baixa", sets: "4x6" }, { name: "Desenv. Arnold", sets: "3x8" }, { name: "Tríceps Testa", sets: "4x8" }, { name: "Tríceps Francês", sets: "3x10" }],
    2: [{ name: "Cadeira Extensora", sets: "4x8" }, { name: "Agachamento Frontal Smith", sets: "4x8" }, { name: "Afundo Smith", sets: "4x8" }, { name: "Leg Press 45°", sets: "4x8" }, { name: "Leg 45° Unilateral", sets: "3x6" }, { name: "Levantamento Terra", sets: "4x6-8" }, { name: "Agachamento Taça", sets: "4x6-8" }, { name: "Panturrilha", sets: "4x8" }],
    3: [{ name: "Puxada Aberta", sets: "4x8" }, { name: "Puxada Neutra", sets: "4x8" }, { name: "Remada Baixa Pronada", sets: "4x8" }, { name: "Remada Cavalinho", sets: "3x8" }, { name: "Rosca Martelo", sets: "4x8" }, { name: "Rosca Direta Barra H", sets: "4x8" }],
    4: [{ name: "Mesa Flexora", sets: "4x8" }, { name: "Elevação Pélvica", sets: "4x8" }, { name: "Abdução Máquina", sets: "4x8" }, { name: "Abdução Inclinado", sets: "4x8" }, { name: "Terra Sumô", sets: "4x8" }, { name: "Agachamento Sumô Step", sets: "4x8" }, { name: "Búlgaro", sets: "3x6" }],
    5: [{ name: "Elevação Frontal", sets: "4x8" }, { name: "Elevação Lateral", sets: "4x8" }, { name: "Desenvolvimento Smith", sets: "3x6" }, { name: "Rosca Scott H", sets: "4x8" }, { name: "Rosca Polia Baixa", sets: "4x6-8" }, { name: "Tríceps Polia W", sets: "4x6-8" }, { name: "Tríceps Corda", sets: "3x6" }],
    6: [{ name: "HIIT Abdominal", sets: "Circuito" }, { name: "Corrida Esteira", sets: "5 km" }],
    0: [{ name: "Descanso Total - SNC", sets: "-" }]
};

// ==========================================
// 2. BANCO DE DADOS (IndexedDB Wrapper)
// ==========================================
const DB = {
    name: 'CuttingDB',
    version: 1,
    db: null,
    
    init() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.name, this.version);
            req.onupgradeneeded = (e) => {
                let db = e.target.result;
                if (!db.objectStoreNames.contains('logs')) db.createObjectStore('logs', { keyPath: 'date' });
                if (!db.objectStoreNames.contains('workouts')) db.createObjectStore('workouts', { keyPath: 'date' });
                if (!db.objectStoreNames.contains('photos')) {
                    let pStore = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
                    pStore.createIndex('date', 'date', { unique: false });
                }
            };
            req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
            req.onerror = (e) => reject(e);
        });
    },

    async put(storeName, data) {
        return new Promise((resolve) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).put(data);
            tx.oncomplete = () => resolve(true);
        });
    },

    async get(storeName, key) {
        return new Promise((resolve) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).get(key);
            req.onsuccess = () => resolve(req.result);
        });
    },

    async getAll(storeName) {
        return new Promise((resolve) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).getAll();
            req.onsuccess = () => resolve(req.result);
        });
    }
};

// ==========================================
// 3. LÓGICA DE UI E ROTEAMENTO
// ==========================================
const UI = {
    init() {
        // Navegação Inferior
        document.querySelectorAll('.nav-item').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
                
                e.target.classList.add('active');
                document.getElementById(e.target.dataset.target).classList.add('active');
                this.loadView(e.target.dataset.target);
            });
        });

        // Setar data de hoje no diário
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('log-date').value = today;
        document.getElementById('log-date').addEventListener('change', this.loadLogForDate);
        
        // Listeners de Salvamento
        document.getElementById('btn-save-log').addEventListener('click', this.saveLog);
        document.getElementById('btn-save-workout').addEventListener('click', this.saveWorkout);
        document.getElementById('log-photo').addEventListener('change', this.handlePhotoPreview);
        document.getElementById('workout-day-select').addEventListener('change', this.renderWorkoutForm);
        document.getElementById('btn-export-csv').addEventListener('click', this.exportCSV);

        // Inicializar com o dia atual de treino
        document.getElementById('workout-day-select').value = new Date().getDay();
        
        this.loadView('view-dashboard');
    },

    async loadView(viewId) {
        if (viewId === 'view-dashboard') await this.renderDashboard();
        if (viewId === 'view-log') await this.loadLogForDate();
        if (viewId === 'view-workout') this.renderWorkoutForm();
        if (viewId === 'view-history') await this.renderHistory();
        if (viewId === 'view-gallery') await this.renderGallery();
    },

    // ------------------------------------------
    // DASHBOARD & ÁRVORE DE DECISÃO
    // ------------------------------------------
    async renderDashboard() {
        const logs = await DB.getAll('logs');
        logs.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Calcular dias restantes
        const daysLeft = Math.ceil((TARGET_DATE - new Date()) / (1000 * 60 * 60 * 24));
        document.getElementById('dash-dias').innerText = daysLeft > 0 ? daysLeft : 0;

        if (logs.length > 0) {
            const lastLog = logs[logs.length - 1];
            document.getElementById('dash-peso').innerText = lastLog.weight ? `${lastLog.weight} kg` : '-- kg';
            
            // Decisão Lógica
            this.runDecisionTree(logs);
            this.renderChart(logs);
        }
    },

    runDecisionTree(logs) {
        const badge = document.getElementById('decision-badge');
        if (logs.length < 7) {
            badge.innerText = "Coletando dados iniciais (mín. 7 dias)...";
            badge.className = "badge neutral";
            return;
        }

        // Médias móveis
        const last7 = logs.slice(-7).filter(l => l.weight).map(l => parseFloat(l.weight));
        const prev7 = logs.slice(-14, -7).filter(l => l.weight).map(l => parseFloat(l.weight));
        
        if (last7.length > 0 && prev7.length > 0) {
            const avgLast = last7.reduce((a,b)=>a+b,0)/last7.length;
            const avgPrev = prev7.reduce((a,b)=>a+b,0)/prev7.length;
            const delta = avgPrev - avgLast;

            if (delta >= 0.3 && delta <= 0.6) {
                badge.innerText = "Badge Verde: Plano funcionando perfeitamente!";
                badge.className = "badge green";
            } else if (delta > 0.6) {
                badge.innerText = "Badge Amarelo: Risco de catabolismo — considere +150-200 kcal ou -10 min cardio";
                badge.className = "badge yellow";
            } else if (delta < 0.1 && delta >= -0.2) {
                badge.innerText = "Badge Laranja: Platô ou Retenção — Verificar sono, sódio e calorias.";
                badge.className = "badge orange";
            } else {
                badge.innerText = "Análise neutra em andamento.";
                badge.className = "badge neutral";
            }
        }
    },

    renderChart(logs) {
        const ctx = document.getElementById('weightChart');
        if (window.myChart) window.myChart.destroy();
        
        const labels = logs.map(l => l.date.substring(5)); // MM-DD
        const dataWeight = logs.map(l => l.weight || null);

        window.myChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Peso Real (kg)',
                    data: dataWeight,
                    borderColor: '#4dff88',
                    backgroundColor: 'rgba(77, 255, 136, 0.1)',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: { responsive: true, scales: { y: { min: 66, max: 73 } } }
        });
    },

    // ------------------------------------------
    // REGISTRO DIÁRIO
    // ------------------------------------------
    async loadLogForDate() {
        const date = document.getElementById('log-date').value;
        const log = await DB.get('logs', date);
        const inputs = ['weight', 'kcal', 'prot', 'carb', 'fat', 'water', 'sleep-hrs', 'sleep-qual', 'hunger', 'energy', 'watch', 'cardio'];
        
        inputs.forEach(id => document.getElementById(`log-${id}`).value = log ? log[id] || '' : '');
        document.getElementById('log-photo-preview').innerHTML = ''; // Limpa preview
    },

    async saveLog() {
        const date = document.getElementById('log-date').value;
        if (!date) return alert('Data obrigatória!');

        const data = { date };
        const inputs = ['weight', 'kcal', 'prot', 'carb', 'fat', 'water', 'sleep-hrs', 'sleep-qual', 'hunger', 'energy', 'watch', 'cardio'];
        inputs.forEach(id => data[id] = document.getElementById(`log-${id}`).value);

        await DB.put('logs', data);
        
        // Salvar Foto no IndexedDB se houver
        const fileInput = document.getElementById('log-photo');
        if (fileInput.files.length > 0) {
            const blob = fileInput.files[0];
            await DB.put('photos', { date: date, type: 'body', blob: blob });
            fileInput.value = ''; // reseta
        }
        
        alert('Registro salvo com sucesso!');
        UI.loadView('view-dashboard');
    },

    handlePhotoPreview(e) {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            document.getElementById('log-photo-preview').innerHTML = `<img src="${url}">`;
        }
    },

    // ------------------------------------------
    // TREINO
    // ------------------------------------------
    renderWorkoutForm() {
        const day = document.getElementById('workout-day-select').value;
        const container = document.getElementById('workout-container');
        const template = WORKOUT_TEMPLATES[day];
        
        let html = '';
        template.forEach((ex, idx) => {
            html += `
                <div class="exercise-card">
                    <h4>${ex.name}</h4>
                    <div class="ex-row">
                        <input type="text" id="ex-sets-${idx}" value="${ex.sets}" style="width: 40%">
                        <input type="number" step="0.5" id="ex-weight-${idx}" placeholder="Carga (kg)" style="width: 60%">
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    },

    async saveWorkout() {
        const date = new Date().toISOString().split('T')[0];
        const day = document.getElementById('workout-day-select').value;
        const template = WORKOUT_TEMPLATES[day];
        
        const exercises = template.map((ex, idx) => ({
            name: ex.name,
            sets: document.getElementById(`ex-sets-${idx}`).value,
            weight: document.getElementById(`ex-weight-${idx}`).value
        }));

        await DB.put('workouts', { date, dayOfWeek: day, exercises });
        alert('Treino registrado!');
    },

    // ------------------------------------------
    // HISTÓRICO E EXPORTAÇÃO
    // ------------------------------------------
    async renderHistory() {
        const logs = await DB.getAll('logs');
        logs.sort((a, b) => new Date(b.date) - new Date(a.date)); // Mais recente primeiro
        const tbody = document.querySelector('#history-table tbody');
        tbody.innerHTML = '';
        
        logs.forEach(log => {
            tbody.innerHTML += `
                <tr>
                    <td>${log.date.substring(5)}</td>
                    <td>${log.weight || '-'}</td>
                    <td>${log.kcal || '-'}</td>
                    <td>${log.prot || '-'}</td>
                    <td>${log.cardio || '-'}</td>
                </tr>
            `;
        });
    },

    async exportCSV() {
        const logs = await DB.getAll('logs');
        let csv = "Data,Peso,Kcal,Proteina,Carboidrato,Gordura,Agua,SonoHr,Cardio\n";
        logs.forEach(l => {
            csv += `${l.date},${l.weight||''},${l.kcal||''},${l.prot||''},${l.carb||''},${l.fat||''},${l.water||''},${l['sleep-hrs']||''},${l.cardio||''}\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cutting_tracker_export_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    },

    // ------------------------------------------
    // GALERIA (FOTOS)
    // ------------------------------------------
    async renderGallery() {
        const photos = await DB.getAll('photos');
        const grid = document.getElementById('gallery-grid');
        grid.innerHTML = '';
        
        photos.sort((a,b) => new Date(b.date) - new Date(a.date)); // Mais recentes
        
        photos.forEach(p => {
            if(p.blob) {
                const url = URL.createObjectURL(p.blob);
                grid.innerHTML += `
                    <div style="position:relative">
                        <img src="${url}" class="gallery-img">
                        <div style="position:absolute; bottom:5px; left:5px; background:rgba(0,0,0,0.7); font-size:10px; padding:2px 5px; border-radius:3px;">
                            ${p.date.substring(5)}
                        </div>
                    </div>
                `;
            }
        });
    }
};

// ==========================================
// 4. INICIALIZAÇÃO & SERVICE WORKER
// ==========================================
window.addEventListener('DOMContentLoaded', async () => {
    // Registrar SW para funcionar offline
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .catch(err => console.log('SW falhou:', err));
    }
    
    // Iniciar DB e UI
    await DB.init();
    UI.init();
});