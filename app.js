// ==========================================
// 1. CONFIGURAÇÕES & DADOS SEMENTE
// ==========================================
const TARGET_DATE = new Date('2026-12-31');
const START_DATE = new Date('2026-09-16');
const START_WEIGHT = 72.0;
const TARGET_WEIGHT = 66.7;
const MASSA_MAGRA_BASE = 56.9; 

const WORKOUT_TEMPLATES = {
    1: [{ name: "Supino Reto", sets: "4x6" }, { name: "Crossover Alta", sets: "4x5" }, { name: "Pullover Polia Baixa", sets: "4x6" }, { name: "Desenv. Arnold", sets: "3x8" }, { name: "Tríceps Testa", sets: "4x8" }, { name: "Tríceps Francês", sets: "3x10" }],
    2: [{ name: "Cadeira Extensora", sets: "4x8" }, { name: "Agachamento Frontal Smith", sets: "4x8" }, { name: "Afundo Smith", sets: "4x8" }, { name: "Leg Press 45°", sets: "4x8" }, { name: "Leg 45° Unilateral", sets: "3x6" }, { name: "Levantamento Terra", sets: "4x6-8" }, { name: "Agachamento Taça", sets: "4x6-8" }, { name: "Panturrilha", sets: "4x8" }],
    3: [{ name: "Puxada Aberta", sets: "4x8" }, { name: "Puxada Neutra", sets: "4x8" }, { name: "Remada Baixa Pronada", sets: "4x8" }, { name: "Remada Cavalinho", sets: "3x8" }, { name: "Rosca Martelo", sets: "4x8" }, { name: "Rosca Direta Barra H", sets: "4x8" }],
    4: [{ name: "Mesa Flexora", sets: "4x8" }, { name: "Elevação Pélvica", sets: "4x8" }, { name: "Abdução Máquina", sets: "4x8" }, { name: "Abdução Inclinado", sets: "4x8" }, { name: "Terra Sumô", sets: "4x8" }, { name: "Agachamento Sumô Step", sets: "4x8" }, { name: "Búlgaro", sets: "3x6" }],
    5: [{ name: "Elevação Frontal", sets: "4x8" }, { name: "Elevação Lateral", sets: "4x8" }, { name: "Desenvolvimento Smith", sets: "3x6" }, { name: "Rosca Scott H", sets: "4x8" }, { name: "Rosca Polia Baixa", sets: "4x6-8" }, { name: "Tríceps Polia W", sets: "4x6-8" }, { name: "Tríceps Corda", sets: "3x6" }],
    6: [{ name: "HIIT Abdominal", sets: "Circuito" }, { name: "Corrida Esteira", sets: "5 km" }],
    0: [{ name: "Descanso Total - SNC", sets: "-" }]
};
const WORKOUT_NAMES = {1: "Peito / Ombros / Tríceps", 2: "Pernas", 3: "Costas / Bíceps", 4: "Posterior / Glúteos", 5: "Ombros / Bíceps / Tríceps", 6: "Abdômen + Cardio", 0: "Recuperação"};
const DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAYS_LBL = {1:"SEG", 2:"TER", 3:"QUA", 4:"QUI", 5:"SEX", 6:"SÁB", 0:"DOM"};

// ==========================================
// 2. BANCO DE DADOS (IndexedDB v2 Seguro)
// ==========================================
const DB = {
    name: 'CuttingDB', version: 2, db: null,
    init() {
        return new Promise((resolve, reject) => {
            try {
                const req = indexedDB.open(this.name, this.version);
                req.onupgradeneeded = (e) => {
                    let db = e.target.result;
                    if (!db.objectStoreNames.contains('logs')) db.createObjectStore('logs', { keyPath: 'date' });
                    if (!db.objectStoreNames.contains('workouts')) db.createObjectStore('workouts', { keyPath: 'date' });
                    if (!db.objectStoreNames.contains('photos')) {
                        let pStore = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
                        pStore.createIndex('date', 'date', { unique: false });
                    }
                    if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'id' });
                };
                req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
                req.onerror = (e) => reject(e.target.error);
            } catch(e) { reject(e); }
        });
    },
    async put(storeName, data) {
        return new Promise((resolve, reject) => {
            try { const tx = this.db.transaction(storeName, 'readwrite'); tx.oncomplete = () => resolve(true); tx.onerror = (e) => reject(e.target.error); tx.objectStore(storeName).put(data); } catch (e) { reject(e); }
        });
    },
    async get(storeName, key) {
        return new Promise((resolve, reject) => {
            try { const tx = this.db.transaction(storeName, 'readonly'); const req = tx.objectStore(storeName).get(key); req.onsuccess = () => resolve(req.result); req.onerror = (e) => reject(e.target.error); } catch(e) { reject(e); }
        });
    },
    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            try { const tx = this.db.transaction(storeName, 'readonly'); const req = tx.objectStore(storeName).getAll(); req.onsuccess = () => resolve(req.result); req.onerror = (e) => reject(e.target.error); } catch(e) { reject(e); }
        });
    }
};

// ==========================================
// 3. LÓGICA DE UI E ROTEAMENTO
// ==========================================
const UI = {
    currentLogDate: new Date(), currentWorkoutDay: new Date().getDay(),
    completedExercises: 0, totalExercises: 0,
    galleryPhotos: [], lightboxIndex: 0, galleryFilter: 'all', compState: { before: null, after: null, step: 'before' }, isSliderActive: false,
    analysisPeriod: 30, charts: { weight: null, bf: null, nutri: null, med: null, strength: null },
    historyFilter: 'all',
    activeObjectUrls: [],

    createURL(blob) { const url = URL.createObjectURL(blob); this.activeObjectUrls.push(url); return url; },
    revokeURLs() { this.activeObjectUrls.forEach(url => URL.revokeObjectURL(url)); this.activeObjectUrls = []; },
    haptic() { if(navigator.vibrate) navigator.vibrate(10); },

    // Core Init
    async init() {
        const now = new Date();
        const opts = { day: 'numeric', month: 'short' };
        document.getElementById('dash-date').innerText = now.toLocaleDateString('pt-BR', opts).toUpperCase();
        let hr = now.getHours();
        document.getElementById('dash-greeting').innerText = hr >= 5 && hr < 12 ? "Bom dia, Jônathas" : (hr >= 12 && hr < 18 ? "Boa tarde, Jônathas" : "Boa noite, Jônathas");

        // Load Settings (Theme & Checklist)
        const themeSet = await DB.get('settings', 'theme');
        if(themeSet && themeSet.value === 'light') document.body.classList.add('light-theme');
        
        document.getElementById('btn-toggle-theme').addEventListener('click', async () => {
            this.haptic();
            const isLight = document.body.classList.toggle('light-theme');
            await DB.put('settings', { id: 'theme', value: isLight ? 'light' : 'dark' });
            this.renderAnalysis(false); // Update charts color
        });

        // Tabs
        document.querySelectorAll('.nav-item').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault(); this.haptic();
                let target = e.currentTarget;
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
                target.classList.add('active');
                document.getElementById(target.dataset.target).classList.add('active');
                this.loadView(target.dataset.target);
            });
        });

        // Diário Init
        this.currentLogDate = new Date();
        this.updateLogDateUI();
        document.getElementById('btn-prev-day').addEventListener('click', () => { this.haptic(); this.changeLogDate(-1); });
        document.getElementById('btn-next-day').addEventListener('click', () => { this.haptic(); this.changeLogDate(1); });
        document.getElementById('btn-today').addEventListener('click', () => { this.haptic(); this.currentLogDate = new Date(); this.updateLogDateUI(); });
        document.getElementById('btn-water-250').addEventListener('click', () => { this.haptic(); this.addWater(0.25); });
        document.getElementById('btn-water-500').addEventListener('click', () => { this.haptic(); this.addWater(0.50); });
        ['prot', 'kcal', 'water'].forEach(id => document.getElementById(`log-${id}`).addEventListener('input', () => this.updateMiniBars()));
        document.getElementById('btn-toggle-med').addEventListener('click', () => { this.haptic(); document.getElementById('med-panel').classList.toggle('open'); });
        document.getElementById('btn-save-log').addEventListener('click', () => { this.haptic(); this.saveLog(); });
        document.getElementById('log-photo').addEventListener('change', (e) => this.handlePhotoPreview(e));
        
        // Treino Init
        this.buildWorkoutNav();
        document.getElementById('btn-save-workout').addEventListener('click', () => { this.haptic(); this.saveWorkout(); });
        
        // Galeria Init
        document.querySelectorAll('#gal-filters .day-pill').forEach(pill => {
            pill.addEventListener('click', (e) => {
                this.haptic(); document.querySelectorAll('#gal-filters .day-pill').forEach(p => p.classList.remove('active'));
                e.currentTarget.classList.add('active'); this.galleryFilter = e.currentTarget.dataset.filter; this.renderGalleryGrid();
            });
        });
        document.getElementById('btn-compare-start').addEventListener('click', () => { this.haptic(); this.openCompareSelector(); });

        // Análise Init
        document.querySelectorAll('#analysis-period-nav .day-pill').forEach(pill => {
            pill.addEventListener('click', (e) => {
                this.haptic(); document.querySelectorAll('#analysis-period-nav .day-pill').forEach(p => p.classList.remove('active'));
                e.currentTarget.classList.add('active'); this.analysisPeriod = e.currentTarget.dataset.days === 'all' ? 9999 : parseInt(e.currentTarget.dataset.days); this.renderAnalysis();
            });
        });
        document.getElementById('an-strength-select').addEventListener('change', () => this.renderAnalysis(false)); 

        // Data Init
        document.getElementById('btn-open-data').addEventListener('click', () => { this.haptic(); this.loadView('view-data'); });
        document.getElementById('btn-export-csv').addEventListener('click', () => { this.haptic(); this.exportCSV(); });
        document.getElementById('btn-backup-json').addEventListener('click', () => { this.haptic(); this.fullBackup(); });
        document.getElementById('btn-restore-click').addEventListener('click', () => { this.haptic(); document.getElementById('input-restore-json').click(); });
        document.getElementById('input-restore-json').addEventListener('change', (e) => this.restoreBackup(e));
        document.querySelectorAll('#history-filters .day-pill').forEach(pill => {
            pill.addEventListener('click', (e) => {
                this.haptic(); document.querySelectorAll('#history-filters .day-pill').forEach(p => p.classList.remove('active'));
                e.currentTarget.classList.add('active'); this.historyFilter = e.currentTarget.dataset.filter; this.renderHistoryList();
            });
        });

        // Load Checklist Semana
        this.loadChecklist();

        Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
        this.loadView('view-dashboard'); 
    },

    async loadView(viewId) {
        this.revokeURLs(); // Free Memory
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
        window.scrollTo(0,0);
        
        try {
            if (viewId === 'view-dashboard') await this.renderDashboard();
            if (viewId === 'view-log') await this.loadLogForDate();
            if (viewId === 'view-workout') await this.renderWorkoutForm();
            if (viewId === 'view-analysis') await this.renderAnalysis();
            if (viewId === 'view-gallery') await this.renderGallery();
            if (viewId === 'view-data') await this.renderHistoryList();
        } catch(e) { console.error("Erro view:", e); }
    },

    // Util Timezone Safe
    getLocalISODate(dateObj) {
        const d = new Date(dateObj);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().split('T')[0];
    },
    changeLogDate(days) { this.currentLogDate.setDate(this.currentLogDate.getDate() + days); this.updateLogDateUI(); },
    updateLogDateUI() {
        document.getElementById('log-date').value = this.getLocalISODate(this.currentLogDate);
        document.getElementById('log-display-date').innerText = this.currentLogDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
        let targetToday = START_WEIGHT - (((this.currentLogDate - START_DATE) / (1000*60*60*24)) * ((START_WEIGHT - TARGET_WEIGHT) / ((TARGET_DATE - START_DATE) / (1000 * 60 * 60 * 24))));
        document.getElementById('log-target-today').innerText = Math.max(TARGET_WEIGHT, Math.min(START_WEIGHT, targetToday)).toFixed(1) + ' kg';
        this.loadLogForDate();
    },

    // ==========================================
    // 1. DASHBOARD E CHECKLIST
    // ==========================================
    async renderDashboard() {
        const logs = await DB.getAll('logs');
        logs.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        const daysLeft = Math.ceil((TARGET_DATE - new Date()) / (1000 * 60 * 60 * 24));
        document.getElementById('dash-dias').innerText = daysLeft > 0 ? daysLeft : 0;
        let currentWeight = START_WEIGHT;

        if (logs.length > 0 && logs.filter(l => l.weight).length > 0) {
            const weightLogs = logs.filter(l => l.weight);
            const lastLog = weightLogs[weightLogs.length - 1];
            currentWeight = parseFloat(lastLog.weight);
            
            document.getElementById('dash-peso').innerText = currentWeight.toFixed(1);
            let progressPercent = ((START_WEIGHT - currentWeight) / (START_WEIGHT - TARGET_WEIGHT)) * 100;
            progressPercent = Math.max(0, Math.min(100, progressPercent));
            document.getElementById('dash-progress-fill').style.width = `${progressPercent}%`;
            document.getElementById('dash-progress-text').innerText = `${Math.round(progressPercent)}% do caminho`;
            let bfCalculated = ((currentWeight - MASSA_MAGRA_BASE) / currentWeight) * 100;
            document.getElementById('dash-bf').innerText = bfCalculated.toFixed(1) + '%';
            document.getElementById('chart-empty-peso').classList.remove('active');
        } else {
            // Empty State
            document.getElementById('dash-peso').innerText = "0.0";
            document.getElementById('dash-delta-val').innerText = "Sem dados";
            document.getElementById('dash-delta-box').className = "dash-hero-delta neutral";
            document.getElementById('dash-bf').innerText = "--%";
            document.getElementById('status-title').innerText = "COLETANDO DADOS";
            document.getElementById('status-dot').className = "dot neutral";
            document.getElementById('status-rate').innerText = "-- kg / sem";
            document.getElementById('chart-empty-peso').classList.add('active');
        }

        this.runDecisionTreeAndSummary(logs, currentWeight);
        this.renderChart(logs);

        // Fotos Recentes
        const photos = await DB.getAll('photos');
        const photoGrid = document.getElementById('dash-photo-grid');
        if (photos.length > 0) {
            photoGrid.innerHTML = '';
            photos.sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 5).forEach(p => {
                if(p.blob) {
                    let wTxt = "-- kg";
                    let matchLog = logs.find(l => l.date === p.date);
                    if(matchLog && matchLog.weight) wTxt = matchLog.weight + ' kg';
                    photoGrid.innerHTML += `<div class="photo-item"><img src="${this.createURL(p.blob)}"><div class="photo-overlay"><span>${p.date.substring(5).replace('-','/')}</span><span style="color: var(--accent);">${wTxt}</span></div></div>`;
                }
            });
        } else {
            photoGrid.innerHTML = `<p class="body" style="padding: 10px 0;">Nenhuma foto registrada ainda.</p>`;
        }
    },

    async runDecisionTreeAndSummary(logs, currentWeight) {
        const deltaBox = document.getElementById('dash-delta-box'); const deltaVal = document.getElementById('dash-delta-val');
        const dot = document.getElementById('status-dot'); const statusTitle = document.getElementById('status-title'); const statusRate = document.getElementById('status-rate');
        const allWorkouts = await DB.getAll('workouts'); const now = new Date(); const msDay = 1000 * 60 * 60 * 24;
        let sumKcal = 0, sumProt = 0, sleepSum = 0; let daysFood = 0, daysSleep = 0, countCardio = 0, countWorkout = 0;

        logs.forEach(l => {
            const diff = (now - new Date(l.date)) / msDay;
            if (diff >= 0 && diff <= 7) {
                if(l.kcal) { sumKcal += parseFloat(l.kcal); daysFood++; } if(l.prot) { sumProt += parseFloat(l.prot); }
                if(l['sleep-hrs']) { sleepSum += parseFloat(l['sleep-hrs']); daysSleep++; } if(l.cardio && l.cardio.length > 2) { countCardio++; }
            }
        });
        allWorkouts.forEach(w => { const diff = (now - new Date(w.date)) / msDay; if (diff >= 0 && diff <= 7 && w.dayOfWeek != "0") { countWorkout++; } });

        const avgProt = daysFood > 0 ? (sumProt / daysFood) : 0; const avgKcal = daysFood > 0 ? (sumKcal / daysFood) : 0;
        let pctProt = (avgProt / 155) * 100; let pctKcal = (avgKcal / 2250) * 100;

        document.getElementById('sum-prot-bar').style.width = `${Math.min(100, pctProt)}%`; document.getElementById('sum-prot-val').innerText = `${Math.round(pctProt)}%`;
        document.getElementById('sum-kcal-bar').style.width = `${Math.min(100, pctKcal)}%`; document.getElementById('sum-kcal-val').innerText = `${Math.round(pctKcal)}%`;
        document.getElementById('sum-workouts').innerHTML = `${countWorkout} <span style="font-size: 14px; color: var(--text-ter);">/ 5</span>`;
        document.getElementById('sum-cardio').innerHTML = `${countCardio} <span style="font-size: 14px; color: var(--text-ter);">/ 6</span>`;
        document.getElementById('sum-sleep').innerHTML = `${daysSleep > 0 ? (sleepSum/daysSleep).toFixed(1) : '--'} <span style="font-size: 14px; color: var(--text-ter);">h</span>`;

        const weightLogs = logs.filter(l => l.weight);
        if (weightLogs.length < 7) {
            deltaVal.innerText = "Sem dados"; statusTitle.innerText = "COLETANDO DADOS"; dot.className = "dot neutral"; statusRate.innerText = "-- kg / sem"; return;
        }

        const last7 = weightLogs.slice(-7).map(l => parseFloat(l.weight));
        const prev7 = weightLogs.slice(-14, -7).map(l => parseFloat(l.weight));
        
        if (last7.length > 0 && prev7.length > 0) {
            const avgLast = last7.reduce((a,b)=>a+b,0)/last7.length; const avgPrev = prev7.reduce((a,b)=>a+b,0)/prev7.length; const delta = avgLast - avgPrev; 
            deltaBox.className = delta > 0 ? 'dash-hero-delta positive' : 'dash-hero-delta negative'; deltaVal.innerText = `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(1)} kg`; statusRate.innerText = `${delta.toFixed(1)} kg / sem`;
            if (delta <= -0.3 && delta >= -0.5) { statusTitle.innerText = "PLANO FUNCIONANDO"; statusTitle.style.color = "var(--success)"; dot.className = "dot green"; } 
            else if (delta < -0.5) { statusTitle.innerText = "RISCO DE CATABOLISMO"; statusTitle.style.color = "var(--warning)"; dot.className = "dot yellow"; } 
            else if (delta > -0.3 && delta <= 0.1) { statusTitle.innerText = "PLATÔ OU RETENÇÃO"; statusTitle.style.color = "#FF8A00"; dot.className = "dot orange"; } 
            else if (delta > 0.1) { statusTitle.innerText = "PESO SUBINDO"; statusTitle.style.color = "var(--danger)"; dot.className = "dot red"; }
        }
    },

    renderChart(logs) {
        const ctx = document.getElementById('weightChart'); if (window.myChart) window.myChart.destroy();
        const weightLogs = logs.filter(l => l.weight);
        if(weightLogs.length === 0) return;

        const labels = weightLogs.map(l => l.date.substring(5)); 
        const dataWeight = weightLogs.map(l => parseFloat(l.weight));
        const totalDays = (TARGET_DATE - START_DATE) / (1000 * 60 * 60 * 24); const kgPerDay = (START_WEIGHT - TARGET_WEIGHT) / totalDays;
        const dataProjected = weightLogs.map(l => { const d = (new Date(l.date) - START_DATE) / (1000 * 60 * 60 * 24); return d < 0 ? START_WEIGHT : START_WEIGHT - (d * kgPerDay); });
        
        Chart.defaults.color = document.body.classList.contains('light-theme') ? '#808A84' : '#68716B';

        window.myChart = new Chart(ctx, {
            type: 'line',
            data: { labels: labels, datasets: [ { label: 'Real', data: dataWeight, borderColor: '#1EB84C', borderWidth: 3, backgroundColor: 'rgba(30, 184, 76, 0.1)', pointBackgroundColor: 'var(--bg-main)', pointBorderColor: '#1EB84C', pointBorderWidth: 2, pointRadius: 4, tension: 0.4, fill: true }, { label: 'Projetado', data: dataProjected, borderColor: 'var(--text-ter)', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, tension: 0, fill: false } ] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 66, max: 73, grid: { color: 'var(--border-light)' } }, x: { grid: { display: false } } } }
        });
    },

    // Checklist Logic
    getWeekKey() { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); const week1 = new Date(d.getFullYear(), 0, 4); return d.getFullYear() + '_W' + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7); },
    async toggleCheck(el) {
        this.haptic(); el.classList.toggle('checked');
        const key = el.dataset.key; const isChecked = el.classList.contains('checked');
        const weekKey = this.getWeekKey();
        let chkData = await DB.get('settings', `chk_${weekKey}`);
        if(!chkData) chkData = { id: `chk_${weekKey}`, checks: {} };
        chkData.checks[key] = isChecked;
        await DB.put('settings', chkData);
    },
    async loadChecklist() {
        const weekKey = this.getWeekKey();
        const chkData = await DB.get('settings', `chk_${weekKey}`);
        document.querySelectorAll('.chk-box').forEach(b => {
            if(chkData && chkData.checks && chkData.checks[b.dataset.key]) b.classList.add('checked');
            else b.classList.remove('checked');
        });
    },

    // ==========================================
    // 2. DIÁRIO (MANTIDO E AUDITADO)
    // ==========================================
    addWater(amount) { const waterInput = document.getElementById('log-water'); let current = parseFloat(waterInput.value) || 0; waterInput.value = (current + amount).toFixed(2); this.updateMiniBars(); },
    updateMiniBars() { 
        const prot = parseFloat(document.getElementById('log-prot').value) || 0; const kcal = parseFloat(document.getElementById('log-kcal').value) || 0; const water = parseFloat(document.getElementById('log-water').value) || 0;
        document.getElementById('bar-log-prot').style.width = `${Math.min(100, (prot/155)*100)}%`; document.getElementById('bar-log-kcal').style.width = `${Math.min(100, (kcal/2250)*100)}%`; document.getElementById('bar-log-water').style.width = `${Math.min(100, (water/4)*100)}%`;
    },
    async loadLogForDate() {
        const date = document.getElementById('log-date').value; const log = await DB.get('logs', date);
        const txtInputs = ['weight', 'kcal', 'prot', 'carb', 'fat', 'water', 'sleep-hrs', 'watch', 'cardio-time']; txtInputs.forEach(id => document.getElementById(`log-${id}`).value = log ? log[id] || '' : '');
        ['sleep-qual', 'hunger', 'energy', 'stress'].forEach(name => { const radios = document.getElementsByName(name); radios.forEach(r => r.checked = false); if (log && log[name]) { const el = document.querySelector(`input[name="${name}"][value="${log[name]}"]`); if(el) el.checked = true; } });
        const cardioRadios = document.getElementsByName('cardio-type'); cardioRadios.forEach(r => r.checked = false); if (log && log['cardio-type']) { const el = document.querySelector(`input[name="cardio-type"][value="${log['cardio-type']}"]`); if(el) el.checked = true; }
        const medInputs = ['cintura', 'abdomen', 'quadril', 'peito', 'braco', 'coxa', 'panturrilha']; medInputs.forEach(id => document.getElementById(`med-${id}`).value = log ? log[id] || '' : '');
        const allLogs = await DB.getAll('logs'); allLogs.sort((a, b) => new Date(b.date) - new Date(a.date)); const lastMedLog = allLogs.find(l => l.cintura || l.abdomen);
        if(lastMedLog) { const opts = { day: '2-digit', month: '2-digit', year: 'numeric' }; document.getElementById('log-last-med-date').innerText = "Última: " + new Date(lastMedLog.date).toLocaleDateString('pt-BR', opts); } else { document.getElementById('log-last-med-date').innerText = "Última: --/--"; }
        const workout = await DB.get('workouts', date); const wContainer = document.getElementById('log-workout-summary');
        if (workout && workout.exercises && workout.exercises.length > 0) { let html = `<p class="workout-summary-title">${WORKOUT_NAMES[workout.dayOfWeek]}</p>`; workout.exercises.forEach(ex => { html += `<div class="workout-item"><span>${ex.name}</span> <span class="workout-weight">${ex.weight ? ex.weight + ' kg' : '-'}</span></div>`; }); wContainer.innerHTML = `<div class="workout-summary">${html}</div>`; } else { wContainer.innerHTML = `<p class="body" style="text-align:center; padding: 10px 0;">Nenhum treino registrado para hoje.</p>`; }
        document.getElementById('log-photo-preview').innerHTML = ''; this.updateMiniBars();
    },
    async saveLog() {
        const date = document.getElementById('log-date').value; if (!date) return alert('Data obrigatória!'); const data = { date };
        const txtInputs = ['weight', 'kcal', 'prot', 'carb', 'fat', 'water', 'sleep-hrs', 'watch', 'cardio-time']; txtInputs.forEach(id => data[id] = document.getElementById(`log-${id}`).value);
        ['sleep-qual', 'hunger', 'energy', 'stress', 'cardio-type'].forEach(name => { const checked = document.querySelector(`input[name="${name}"]:checked`); data[name] = checked ? checked.value : ''; });
        const medInputs = ['cintura', 'abdomen', 'quadril', 'peito', 'braco', 'coxa', 'panturrilha']; medInputs.forEach(id => data[id] = document.getElementById(`med-${id}`).value);
        data.cardio = data['cardio-type'] ? `${data['cardio-time'] || 0} min ${data['cardio-type']}` : '';
        try {
            await DB.put('logs', data);
            const fileInput = document.getElementById('log-photo');
            if (fileInput.files.length > 0) { const tag = document.getElementById('log-photo-tag').value; await DB.put('photos', { date: date, type: 'body', tag: tag, blob: fileInput.files[0] }); fileInput.value = ''; document.getElementById('log-photo-preview').innerHTML = ''; }
            let btn = document.getElementById('btn-save-log'); let originalText = btn.innerText; btn.innerText = "SALVO COM SUCESSO!"; btn.style.background = "var(--success)";
            setTimeout(() => { btn.innerText = originalText; btn.style.background = "var(--accent)"; }, 1500);
        } catch(e) { alert('Erro ao salvar: ' + e.message); }
    },
    handlePhotoPreview(e) { const file = e.target.files[0]; if (file) document.getElementById('log-photo-preview').innerHTML = `<img src="${this.createURL(file)}">`; },

    // ==========================================
    // 3. TREINO (MANTIDO E AUDITADO)
    // ==========================================
    buildWorkoutNav() {
        const nav = document.getElementById('workout-day-nav'); nav.innerHTML = '';
        DAYS_ORDER.forEach(day => {
            const pill = document.createElement('div'); pill.className = `day-pill ${day === this.currentWorkoutDay ? 'active' : ''}`; pill.innerText = DAYS_LBL[day]; pill.dataset.day = day;
            pill.addEventListener('click', () => { this.haptic(); document.querySelectorAll('.day-pill').forEach(p => p.classList.remove('active')); pill.classList.add('active'); this.currentWorkoutDay = day; this.renderWorkoutForm(); });
            nav.appendChild(pill);
        });
        setTimeout(() => { const activePill = nav.querySelector('.active'); if(activePill) activePill.scrollIntoView({behavior: 'smooth', block: 'nearest', inline: 'center'}); }, 100);
    },
    async renderWorkoutForm() {
        const day = this.currentWorkoutDay; const container = document.getElementById('workout-container'); document.getElementById('wo-title').innerText = WORKOUT_NAMES[day];
        const progCard = document.getElementById('wo-progress-card'); const footer = document.getElementById('workout-footer');
        if (day === 0) { document.getElementById('wo-meta').innerText = "Dia de Descanso"; progCard.style.display = 'none'; footer.style.display = 'none'; container.innerHTML = `<div class="rest-card"><svg class="rest-icon" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg><h3 class="heading">RECUPERAÇÃO</h3><p class="body">Dia de recuperação do SNC. Mantenha o corpo hidratado.</p><button class="btn-outline" onclick="document.querySelector('[data-target=\\'view-log\\']').click()">Ir para Diário</button></div>`; return; }
        const template = WORKOUT_TEMPLATES[day]; document.getElementById('wo-meta').innerText = `${template.length} exercícios`; progCard.style.display = 'block'; footer.style.display = 'block';
        this.totalExercises = template.length; this.completedExercises = 0; this.updateWorkoutProgress();
        const history = await DB.getAll('workouts'); history.sort((a,b) => new Date(a.date) - new Date(b.date)); const allPhotos = await DB.getAll('photos');
        let html = '';
        template.forEach((ex, idx) => {
            let exHistory = []; history.forEach(w => { const found = w.exercises.find(e => e.name === ex.name); if (found && found.weight) exHistory.push(parseFloat(found.weight)); });
            let best = exHistory.length ? Math.max(...exHistory) : 0; let last = exHistory.length ? exHistory[exHistory.length - 1] : 0; let prevLast = exHistory.length > 1 ? exHistory[exHistory.length - 2] : 0; let delta = last - prevLast;
            let deltaClass = 'neutral'; let deltaStr = '-'; if (delta > 0) { deltaClass = 'trend-up'; deltaStr = `↑ +${delta} kg`; } else if (delta < 0) { deltaClass = 'trend-down'; deltaStr = `↓ ${delta} kg`; }
            let historyPath = exHistory.slice(-3).map(w => `${w} kg`).join(' <span class="history-arrow">→</span> '); if(!historyPath) historyPath = "Sem histórico anterior";
            let photosHtml = ''; let exPhotos = allPhotos.filter(p => p.type === 'exercise' && p.exercise === ex.name).slice(-3);
            if (exPhotos.length > 0) { photosHtml = `<div class="mini-thumb-row">` + exPhotos.map(p => `<img src="${this.createURL(p.blob)}" class="mini-thumb">`).join('') + `</div>`; }
            html += `<div class="ex-card" id="ex-card-${idx}"><div class="ex-header" onclick="UI.toggleExerciseCard(${idx})"><div class="ex-info"><h4>${ex.name}</h4><div class="ex-badges"><span class="badge-pill">${ex.sets}</span><span class="badge-pill" id="ex-display-weight-${idx}">${last ? last+' kg' : '--'}</span><span class="badge-pill ${deltaClass}">${deltaStr}</span></div></div><svg class="ex-toggle-icon" viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg></div><div class="ex-details" id="ex-details-${idx}"><div class="ex-grid-2"><div><label style="margin-top:0">Séries / Reps</label><input type="text" id="ex-sets-${idx}" class="ex-input std" value="${ex.sets}"></div><div><label style="margin-top:0">Observação</label><input type="text" id="ex-obs-${idx}" class="ex-input std" placeholder="Opcional..."></div></div><label>Carga Utilizada (kg)</label><div class="weight-stepper-box"><div class="weight-stepper"><button class="stepper-btn" onclick="UI.stepWeight(${idx}, -1)">−</button><input type="number" step="0.5" inputmode="decimal" id="ex-weight-${idx}" class="stepper-input" value="${last || ''}" oninput="document.getElementById('ex-display-weight-${idx}').innerText = this.value + ' kg'"><button class="stepper-btn" onclick="UI.stepWeight(${idx}, 1)">+</button></div><div class="weight-meta-grid"><div class="weight-meta-item"><p class="caption">ÚLTIMA VEZ</p><p class="val">${last ? last+' kg' : '--'}</p></div><div class="weight-meta-item"><p class="caption">MELHOR</p><p class="val">${best ? best+' kg' : '--'}</p></div></div></div><div class="ex-history-box"><p class="caption">ÚLTIMAS SESSÕES</p><p class="ex-history-path">${historyPath}</p>${photosHtml}</div><div style="display:flex; justify-content: space-between; align-items:center; margin: 16px 0;"><label style="margin:0"><svg style="width:16px; height:16px; vertical-align:middle; margin-right:4px;" viewBox="0 0 24 24"><path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg> Foto</label><input type="file" id="ex-photo-${idx}" accept="image/*" capture="environment" style="width: 140px; padding: 0;"></div><button class="btn-ex-complete" id="btn-comp-${idx}" onclick="UI.completeExercise(${idx})">MARCAR COMO CONCLUÍDO ✓</button></div></div>`;
        });
        container.innerHTML = html;
    },
    toggleExerciseCard(idx) { this.haptic(); const card = document.getElementById(`ex-card-${idx}`); if(card.classList.contains('expanded')) card.classList.remove('expanded'); else { document.querySelectorAll('.ex-card.expanded').forEach(c => c.classList.remove('expanded')); card.classList.add('expanded'); } },
    stepWeight(idx, step) { this.haptic(); const input = document.getElementById(`ex-weight-${idx}`); const display = document.getElementById(`ex-display-weight-${idx}`); let current = parseFloat(input.value) || 0; let newVal = Math.max(0, current + step); input.value = newVal; display.innerText = newVal + ' kg'; },
    completeExercise(idx) {
        this.haptic(); const card = document.getElementById(`ex-card-${idx}`); const btn = document.getElementById(`btn-comp-${idx}`);
        if (!card.classList.contains('completed')) { card.classList.add('completed'); card.classList.remove('expanded'); btn.innerText = "EXERCÍCIO CONCLUÍDO ✓"; this.completedExercises++; } else { card.classList.remove('completed'); btn.innerText = "MARCAR COMO CONCLUÍDO ✓"; this.completedExercises--; }
        this.updateWorkoutProgress();
    },
    updateWorkoutProgress() { let pct = this.totalExercises > 0 ? (this.completedExercises / this.totalExercises) * 100 : 0; document.getElementById('wo-progress-pct').innerText = Math.round(pct); document.getElementById('wo-progress-txt').innerText = `${this.completedExercises} / ${this.totalExercises}`; document.getElementById('wo-progress-fill').style.width = `${pct}%`; let footerBtn = document.getElementById('btn-save-workout'); if(pct === 100) { footerBtn.style.background = "var(--success)"; footerBtn.style.color = "#000"; } else { footerBtn.style.background = "var(--text-main)"; footerBtn.style.color = "var(--bg-main)"; } },
    async saveWorkout() {
        const date = document.getElementById('log-date').value || new Date().toISOString().split('T')[0]; const day = this.currentWorkoutDay; const template = WORKOUT_TEMPLATES[day];
        const exercises = template.map((ex, idx) => ({ name: ex.name, sets: document.getElementById(`ex-sets-${idx}`).value, weight: document.getElementById(`ex-weight-${idx}`).value, obs: document.getElementById(`ex-obs-${idx}`).value }));
        try {
            await DB.put('workouts', { date, dayOfWeek: day, exercises });
            for (let idx = 0; idx < template.length; idx++) { const fileInput = document.getElementById(`ex-photo-${idx}`); if (fileInput && fileInput.files.length > 0) { await DB.put('photos', { date: date, type: 'exercise', exercise: template[idx].name, blob: fileInput.files[0] }); } }
            let btn = document.getElementById('btn-save-workout'); let originalText = btn.innerText; btn.innerText = "TREINO SALVO!";
            setTimeout(() => { btn.innerText = originalText; this.loadView('view-dashboard'); }, 1500);
        } catch(e) { alert("Erro ao salvar treino: " + e.message); }
    },

    // ==========================================
    // 4. GALERIA AGRUPADA POR MÊS
    // ==========================================
    async renderGallery() {
        const photos = await DB.getAll('photos'); const logs = await DB.getAll('logs');
        let bodyPhotos = photos.filter(p => p.type === 'body').sort((a,b) => new Date(b.date) - new Date(a.date));
        this.galleryPhotos = bodyPhotos.map(p => { let log = logs.find(l => l.date === p.date); return { ...p, weight: log && log.weight ? log.weight : null, url: this.createURL(p.blob) }; });
        if(this.galleryPhotos.length > 0) { const oldest = this.galleryPhotos[this.galleryPhotos.length - 1]; document.getElementById('gal-start-date').innerText = oldest.date.split('-').reverse().join('/'); document.getElementById('gal-count').innerText = this.galleryPhotos.length; }
        this.renderGalleryGrid();
    },
    renderGalleryGrid() {
        const grid = document.getElementById('gallery-grid'); grid.innerHTML = '';
        let filtered = this.galleryPhotos;
        if(this.galleryFilter === 'peso') filtered = filtered.filter(p => p.weight);
        else if (['frente', 'lado', 'costas'].includes(this.galleryFilter)) filtered = filtered.filter(p => p.tag === this.galleryFilter);

        if(filtered.length === 0) { grid.innerHTML = `<p class="body" style="text-align:center; margin-top: 40px;">Nenhuma foto encontrada neste filtro.</p>`; return; }

        // Agrupamento por Mês
        let currentMonth = "";
        const months = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];

        filtered.forEach((p) => {
            const realIdx = this.galleryPhotos.indexOf(p);
            let dObj = new Date(p.date); dObj.setDate(dObj.getDate() + 1); // fix tz
            let mName = `${months[dObj.getMonth()]} ${dObj.getFullYear()}`;
            
            if (mName !== currentMonth) {
                currentMonth = mName;
                grid.innerHTML += `<div style="grid-column: span 2;"><p class="gal-month-title">${currentMonth}</p></div>`;
            }

            grid.innerHTML += `
                <div class="gallery-item" onclick="UI.openLightbox(${realIdx})">
                    <img src="${p.url}">
                    <div class="gallery-item-overlay">
                        <span class="caption" style="color:#fff">${p.date.substring(5).replace('-','/')}</span>
                        <span class="weight">${p.weight ? p.weight+'kg' : ''}</span>
                    </div>
                </div>`;
        });
    },
    openLightbox(idx) { this.lightboxIndex = idx; document.getElementById('lb-modal').classList.add('active'); this.updateLightboxContent(); }, 
    closeLightbox() { document.getElementById('lb-modal').classList.remove('active'); }, 
    navLightbox(dir) { this.lightboxIndex += dir; if(this.lightboxIndex < 0) this.lightboxIndex = this.galleryPhotos.length - 1; if(this.lightboxIndex >= this.galleryPhotos.length) this.lightboxIndex = 0; this.updateLightboxContent(); }, 
    updateLightboxContent() { const p = this.galleryPhotos[this.lightboxIndex]; let d = new Date(p.date); d.setDate(d.getDate() + 1); document.getElementById('lb-img').src = p.url; document.getElementById('lb-date').innerText = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase(); document.getElementById('lb-weight').innerText = p.weight ? p.weight + ' kg' : 'S/ Peso'; },
    
    // Compare
    openCompareSelector() {
        this.compState = { before: null, after: null, step: 'before' }; document.getElementById('comp-sel-step').innerText = "ANTES";
        const grid = document.getElementById('comp-sel-grid'); grid.innerHTML = '';
        this.galleryPhotos.forEach((p, idx) => { grid.innerHTML += `<div class="selector-item" id="sel-item-${idx}" onclick="UI.selectComparePhoto(${idx})"><img src="${p.url}" style="width:100%; height:100%; object-fit:cover;"><div style="position:absolute; bottom:0; left:0; width:100%; background:rgba(0,0,0,0.7); padding:6px; text-align:center;"><span class="caption" style="color:#fff">${p.date.substring(5).replace('-','/')}</span></div></div>`; });
        document.getElementById('compare-selector').classList.add('active');
    },
    closeCompareSelector() { document.getElementById('compare-selector').classList.remove('active'); }, 
    selectComparePhoto(idx) {
        this.haptic(); const p = this.galleryPhotos[idx];
        if (this.compState.step === 'before') { this.compState.before = p; document.querySelectorAll('.selector-item').forEach(el => el.classList.remove('selected')); document.getElementById(`sel-item-${idx}`).classList.add('selected'); setTimeout(() => { this.compState.step = 'after'; document.getElementById('comp-sel-step').innerText = "DEPOIS"; }, 300); } 
        else { this.compState.after = p; document.getElementById(`sel-item-${idx}`).classList.add('selected'); setTimeout(() => { this.closeCompareSelector(); this.openCompareView(); }, 300); }
    },
    openCompareView() { document.getElementById('compare-view').classList.add('active'); this.setCompareMode('slider'); }, 
    closeCompareView() { document.getElementById('compare-view').classList.remove('active'); this.isSliderActive = false; }, 
    setCompareMode(mode) {
        this.haptic(); const ws = document.getElementById('cw-workspace'); const b = this.compState.before; const a = this.compState.after;
        const dateB = b.date.split('-').reverse().slice(0,2).join('/') + ' (' + (b.weight||'-') + ')'; const dateA = a.date.split('-').reverse().slice(0,2).join('/') + ' (' + (a.weight||'-') + ')';
        if (mode === 'side') { this.isSliderActive = false; ws.innerHTML = `<div class="compare-side-by-side"><div class="compare-half"><div class="compare-label cl-left">${dateB}</div><img src="${b.url}"></div><div class="compare-half"><div class="compare-label cl-right">${dateA}</div><img src="${a.url}"></div></div>`; } 
        else { this.isSliderActive = true; ws.innerHTML = `<div class="compare-slider-wrapper" id="slider-wrap"><img src="${a.url}" class="cs-img cs-img-after"><img src="${b.url}" class="cs-img cs-img-before" id="cs-img-before"><div class="cs-handle" id="cs-handle"></div><div class="compare-label cl-left">${dateB}</div><div class="compare-label cl-right">${dateA}</div></div>`; this.initSliderEvents(); }
    }, 
    initSliderEvents() {
        const wrap = document.getElementById('slider-wrap'); const handle = document.getElementById('cs-handle'); const imgBefore = document.getElementById('cs-img-before'); let isDragging = false;
        const updateHandle = (x) => { if(!wrap) return; const rect = wrap.getBoundingClientRect(); let pos = x - rect.left; if (pos < 0) pos = 0; if (pos > rect.width) pos = rect.width; let pct = (pos / rect.width) * 100; handle.style.left = `${pct}%`; imgBefore.style.clipPath = `inset(0 ${100 - pct}% 0 0)`; };
        const start = (e) => { isDragging = true; updateHandle(e.type.includes('touch') ? e.touches[0].clientX : e.clientX); }; const move = (e) => { if(isDragging) updateHandle(e.type.includes('touch') ? e.touches[0].clientX : e.clientX); }; const end = () => { isDragging = false; };
        wrap.addEventListener('mousedown', start); wrap.addEventListener('touchstart', start, {passive: true}); window.addEventListener('mousemove', move); window.addEventListener('touchmove', move, {passive: true}); window.addEventListener('mouseup', end); window.addEventListener('touchend', end);
    },

    // ==========================================
    // 5. ANÁLISE PREMIUM (MANTIDO E AUDITADO)
    // ==========================================
    async renderAnalysis(fullReload = true) {
        const allLogs = await DB.getAll('logs'); const allWorkouts = await DB.getAll('workouts');
        const cutoffDate = new Date(); cutoffDate.setDate(cutoffDate.getDate() - this.analysisPeriod);
        const periodLogs = allLogs.filter(l => new Date(l.date) >= cutoffDate).sort((a, b) => new Date(a.date) - new Date(b.date));
        const periodWorkouts = allWorkouts.filter(w => new Date(w.date) >= cutoffDate).sort((a, b) => new Date(a.date) - new Date(b.date));
        if (fullReload) { this.buildAnalysisWeight(periodLogs); this.buildAnalysisBF(periodLogs); this.buildAnalysisNutrition(periodLogs); this.buildAnalysisMeasurements(periodLogs); this.populateStrengthSelector(allWorkouts); }
        this.buildAnalysisStrength(periodWorkouts); if(fullReload) this.buildInsights(periodLogs, periodWorkouts);
    },
    buildAnalysisWeight(logs) {
        const weightLogs = logs.filter(l => l.weight); const elAtual = document.getElementById('an-peso-atual'); const elDelta = document.getElementById('an-peso-delta'); const overlay = document.getElementById('chart-empty-peso');
        if (weightLogs.length === 0) { elAtual.innerText = '-- kg'; elDelta.innerText = 'Sem dados'; elDelta.className = "an-delta-badge neutral"; overlay.classList.add('active'); if(this.charts.weight) this.charts.weight.destroy(); return; }
        overlay.classList.remove('active');
        const firstW = parseFloat(weightLogs[0].weight); const lastW = parseFloat(weightLogs[weightLogs.length - 1].weight); const delta = lastW - firstW;
        elAtual.innerText = lastW.toFixed(1) + ' kg'; elDelta.className = delta > 0 ? 'an-delta-badge pos' : 'an-delta-badge neg'; elDelta.innerText = `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(1)} kg`;
        if(this.charts.weight) this.charts.weight.destroy(); const ctx = document.getElementById('anWeightChart');
        const labels = weightLogs.map(l => l.date.substring(5)); const dataWeight = weightLogs.map(l => parseFloat(l.weight));
        const totalProjectDays = (TARGET_DATE - START_DATE) / (1000 * 60 * 60 * 24); const kgPerDay = (START_WEIGHT - TARGET_WEIGHT) / totalProjectDays;
        const dataProjected = weightLogs.map(l => { const daysSinceStart = (new Date(l.date) - START_DATE) / (1000 * 60 * 60 * 24); return daysSinceStart < 0 ? START_WEIGHT : START_WEIGHT - (daysSinceStart * kgPerDay); });
        
        Chart.defaults.color = document.body.classList.contains('light-theme') ? '#808A84' : '#68716B';
        this.charts.weight = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: [ { label: 'Real', data: dataWeight, borderColor: '#1EB84C', borderWidth: 2, tension: 0.3, pointRadius: 0 }, { label: 'Projetado', data: dataProjected, borderColor: 'var(--text-ter)', borderWidth: 1, borderDash: [5, 5], tension: 0, pointRadius: 0 } ] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { grid: { color: 'var(--border-light)' } } } } });
    },
    buildAnalysisBF(logs) {
        const weightLogs = logs.filter(l => l.weight); const overlay = document.getElementById('chart-empty-bf');
        if (weightLogs.length === 0) { document.getElementById('an-bf-atual').innerText = '--%'; document.getElementById('an-bf-inicial').innerText = '--%'; overlay.classList.add('active'); if(this.charts.bf) this.charts.bf.destroy(); return; }
        overlay.classList.remove('active'); const calcBF = (w) => ((w - MASSA_MAGRA_BASE) / w) * 100;
        const firstW = parseFloat(weightLogs[0].weight); const lastW = parseFloat(weightLogs[weightLogs.length - 1].weight);
        document.getElementById('an-bf-atual').innerText = calcBF(lastW).toFixed(1) + '%'; document.getElementById('an-bf-inicial').innerText = calcBF(firstW).toFixed(1) + '%';
        if(this.charts.bf) this.charts.bf.destroy(); const ctx = document.getElementById('anBfChart');
        const labels = weightLogs.map(l => l.date.substring(5)); const dataBf = weightLogs.map(l => calcBF(parseFloat(l.weight)));
        this.charts.bf = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: [{ data: dataBf, borderColor: '#4DA8FF', borderWidth: 2, tension: 0.3, fill: true, backgroundColor: 'rgba(77, 168, 255, 0.1)', pointRadius: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { grid: { color: 'var(--border-light)' } } } } });
    },
    buildAnalysisNutrition(logs) {
        const nutriLogs = logs.filter(l => l.prot || l.kcal); const overlay = document.getElementById('chart-empty-nutri');
        if (nutriLogs.length === 0) { document.getElementById('an-prot-avg').innerText = '-- g'; document.getElementById('an-kcal-avg').innerText = '-- kcal'; overlay.classList.add('active'); if(this.charts.nutri) this.charts.nutri.destroy(); return; }
        overlay.classList.remove('active'); let sumP = 0, sumK = 0, cP = 0, cK = 0;
        nutriLogs.forEach(l => { if(l.prot) { sumP += parseFloat(l.prot); cP++; } if(l.kcal) { sumK += parseFloat(l.kcal); cK++; } });
        document.getElementById('an-prot-avg').innerText = cP > 0 ? Math.round(sumP/cP) + ' g' : '--'; document.getElementById('an-kcal-avg').innerText = cK > 0 ? Math.round(sumK/cK) + ' kcal' : '--';
        if(this.charts.nutri) this.charts.nutri.destroy(); const ctx = document.getElementById('anNutriChart');
        const labels = nutriLogs.map(l => l.date.substring(5)); const dataProt = nutriLogs.map(l => l.prot ? parseFloat(l.prot) : null); const dataKcal = nutriLogs.map(l => l.kcal ? parseFloat(l.kcal) : null);
        this.charts.nutri = new Chart(ctx, { type: 'bar', data: { labels: labels, datasets: [ { label: 'Prot (g)', data: dataProt, backgroundColor: '#1EB84C', yAxisID: 'yProt', borderRadius: 4 }, { label: 'Kcal', type: 'line', data: dataKcal, borderColor: 'var(--text-sec)', borderWidth: 2, yAxisID: 'yKcal', pointRadius: 0, tension: 0.3 } ] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, yProt: { type: 'linear', position: 'left', grid: { color: 'var(--border-light)' }, min: 0, max: 200 }, yKcal: { type: 'linear', position: 'right', grid: { display: false }, min: 0, max: 3000 } } } });
    },
    buildAnalysisMeasurements(logs) {
        const medLogs = logs.filter(l => l.cintura || l.abdomen); const overlay = document.getElementById('chart-empty-med');
        if (medLogs.length === 0) { document.getElementById('an-med-cintura').innerText = '-- cm'; document.getElementById('an-med-abdomen').innerText = '-- cm'; overlay.classList.add('active'); if(this.charts.med) this.charts.med.destroy(); return; }
        overlay.classList.remove('active'); const firstL = medLogs[0]; const lastL = medLogs[medLogs.length - 1];
        const calcDelta = (f, l) => { if(!f || !l) return '-- cm'; let d = parseFloat(l) - parseFloat(f); return (d > 0 ? '+' : '') + d.toFixed(1) + ' cm'; };
        document.getElementById('an-med-cintura').innerText = calcDelta(firstL.cintura, lastL.cintura); document.getElementById('an-med-abdomen').innerText = calcDelta(firstL.abdomen, lastL.abdomen);
        if(this.charts.med) this.charts.med.destroy(); const ctx = document.getElementById('anMedChart'); const labels = medLogs.map(l => l.date.substring(5));
        this.charts.med = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: [ { label: 'Cintura', data: medLogs.map(l => l.cintura ? parseFloat(l.cintura) : null), borderColor: '#E89E0C', tension: 0.3, pointRadius: 3 }, { label: 'Abdômen', data: medLogs.map(l => l.abdomen ? parseFloat(l.abdomen) : null), borderColor: '#E33E3E', tension: 0.3, pointRadius: 3 } ] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { grid: { color: 'var(--border-light)' } } } } });
    },
    populateStrengthSelector(allWorkouts) {
        const sel = document.getElementById('an-strength-select'); let uniqueEx = new Set();
        allWorkouts.forEach(w => w.exercises.forEach(e => { if(e.weight && parseFloat(e.weight) > 0) uniqueEx.add(e.name); }));
        sel.innerHTML = '';
        if(uniqueEx.size === 0) { sel.innerHTML = '<option value="">Sem dados de carga</option>'; return; }
        let exArray = Array.from(uniqueEx).sort(); exArray.forEach(ex => sel.innerHTML += `<option value="${ex}">${ex}</option>`);
        let defaultEx = exArray.find(e => e.toLowerCase().includes('supino') || e.toLowerCase().includes('agachamento')); if(defaultEx) sel.value = defaultEx;
    },
    buildAnalysisStrength(periodWorkouts) {
        const sel = document.getElementById('an-strength-select'); const exName = sel.value; const overlay = document.getElementById('chart-empty-str');
        const elLast = document.getElementById('an-str-last'); const elMax = document.getElementById('an-str-max'); const elDelta = document.getElementById('an-str-delta');
        if(!exName) { overlay.classList.add('active'); elLast.innerText = '-- kg'; elMax.innerText = '-- kg'; elDelta.innerText = '-- kg'; if(this.charts.strength) this.charts.strength.destroy(); return; }
        let dataPoints = []; periodWorkouts.forEach(w => { let ex = w.exercises.find(e => e.name === exName); if(ex && ex.weight) dataPoints.push({ date: w.date, weight: parseFloat(ex.weight) }); });
        if(dataPoints.length === 0) { overlay.classList.add('active'); elLast.innerText = '-- kg'; elMax.innerText = '-- kg'; elDelta.innerText = '-- kg'; if(this.charts.strength) this.charts.strength.destroy(); return; }
        overlay.classList.remove('active');
        const maxW = Math.max(...dataPoints.map(d => d.weight)); const firstW = dataPoints[0].weight; const lastW = dataPoints[dataPoints.length - 1].weight; const delta = lastW - firstW;
        elLast.innerText = lastW + ' kg'; elMax.innerText = maxW + ' kg'; elDelta.innerText = (delta > 0 ? '+' : '') + delta + ' kg'; elDelta.style.color = delta >= 0 ? 'var(--accent)' : 'var(--danger)';
        if(this.charts.strength) this.charts.strength.destroy(); const ctx = document.getElementById('anStrengthChart');
        this.charts.strength = new Chart(ctx, { type: 'line', data: { labels: dataPoints.map(d => d.date.substring(5)), datasets: [{ label: 'Carga (kg)', data: dataPoints.map(d => d.weight), borderColor: 'var(--text-main)', borderWidth: 2, tension: 0.1, pointBackgroundColor: '#1EB84C' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { grid: { color: 'var(--border-light)' } } } } });
    },
    buildInsights(logs, workouts) {
        const container = document.getElementById('an-insights-container'); container.innerHTML = ''; let insights = [];
        const weightLogs = logs.filter(l => l.weight);
        if (weightLogs.length >= 2) {
            let delta = parseFloat(weightLogs[weightLogs.length-1].weight) - parseFloat(weightLogs[0].weight);
            if (delta < 0) insights.push({ text: `Seu peso caiu <strong>${Math.abs(delta).toFixed(1)} kg</strong> neste período.`, type: 'success' });
            else if (delta > 0) insights.push({ text: `Seu peso subiu <strong>${delta.toFixed(1)} kg</strong> neste período. Fique de olho na retenção ou calorias.`, type: 'warning' });
            else insights.push({ text: `Seu peso manteve-se estável.`, type: 'neutral' });
        }
        const nutriLogs = logs.filter(l => l.prot);
        if(nutriLogs.length > 3) {
            let sumP = 0; nutriLogs.forEach(l => sumP += parseFloat(l.prot)); let avgP = sumP / nutriLogs.length;
            if(avgP >= 140 && avgP <= 170) insights.push({ text: `Excelente! A proteína média (<strong>${Math.round(avgP)}g</strong>) ficou cravada na faixa planejada.`, type: 'success' });
            else if (avgP < 140) insights.push({ text: `Proteína média (<strong>${Math.round(avgP)}g</strong>) abaixo do ideal.`, type: 'danger' });
        }
        const exName = document.getElementById('an-strength-select').value;
        if (exName) {
            let pts = []; workouts.forEach(w => { let e = w.exercises.find(x => x.name === exName); if(e && e.weight) pts.push(parseFloat(e.weight)); });
            if (pts.length >= 2) {
                let deltaStr = pts[pts.length-1] - pts[0];
                if(deltaStr > 0) insights.push({ text: `A carga do <strong>${exName}</strong> aumentou <strong>${deltaStr} kg</strong> neste período.`, type: 'success' });
                else if (deltaStr < 0) insights.push({ text: `Houve leve queda de força no <strong>${exName}</strong> (-${Math.abs(deltaStr)} kg). Normal em cutting.`, type: 'warning' });
            }
        }
        const sleepLogs = logs.filter(l => l['sleep-hrs']);
        if(sleepLogs.length > 0) {
            let sumS = 0; sleepLogs.forEach(l => sumS += parseFloat(l['sleep-hrs'])); let avgS = sumS / sleepLogs.length;
            if(avgS < 6.5) insights.push({ text: `Seu sono médio está baixo (<strong>${avgS.toFixed(1)}h</strong>). Isso pode prejudicar a perda de gordura.`, type: 'danger' });
        }
        if(insights.length === 0) { container.innerHTML = `<div class="insight-box"><p>Reúna mais registros para gerar insights automáticos.</p></div>`; return; }
        insights.forEach(ins => { let cssClass = 'insight-box'; if(ins.type === 'warning') cssClass += ' warning'; if(ins.type === 'danger') cssClass += ' danger'; container.innerHTML += `<div class="${cssClass}"><p>${ins.text}</p></div>`; });
    },

    // ==========================================
    // 6. HISTÓRICO & DADOS MESTRE (MANTIDO)
    // ==========================================
    async renderHistoryList() {
        const allLogs = await DB.getAll('logs'); const allWorkouts = await DB.getAll('workouts'); const listEl = document.getElementById('history-list'); listEl.innerHTML = '';
        let mergedMap = {}; allLogs.forEach(l => mergedMap[l.date] = { log: l, workout: null }); allWorkouts.forEach(w => { if(!mergedMap[w.date]) mergedMap[w.date] = { log: null, workout: w }; else mergedMap[w.date].workout = w; });
        let sortedDates = Object.keys(mergedMap).sort((a,b) => new Date(b) - new Date(a));
        let filteredDates = sortedDates.filter(d => { let m = mergedMap[d]; if (this.historyFilter === 'all') return true; if (this.historyFilter === 'peso' && m.log && m.log.weight) return true; if (this.historyFilter === 'nutri' && m.log && (m.log.kcal || m.log.prot)) return true; if (this.historyFilter === 'treino' && m.workout) return true; if (this.historyFilter === 'medidas' && m.log && (m.log.cintura || m.log.abdomen)) return true; return false; });
        if (filteredDates.length === 0) { listEl.innerHTML = `<p class="body" style="text-align:center; margin-top:20px;">Nenhum registro encontrado.</p>`; return; }
        const totalProjectDays = (TARGET_DATE - START_DATE) / (1000 * 60 * 60 * 24); const kgPerDay = (START_WEIGHT - TARGET_WEIGHT) / totalProjectDays;
        filteredDates.forEach((d, idx) => {
            let m = mergedMap[d]; let dObj = new Date(d); dObj.setDate(dObj.getDate() + 1); const opts = { day: '2-digit', month: 'short' }; let dateStr = dObj.toLocaleDateString('pt-BR', opts).toUpperCase();
            let tags = []; if(m.log && m.log.weight) tags.push(`<span class="hc-tag" style="color:var(--text-main); border-color:var(--text-main);">PESO</span>`); if(m.workout && m.workout.dayOfWeek != "0") tags.push(`<span class="hc-tag" style="color:var(--accent); border-color:var(--accent);">TREINO</span>`); if(m.log && (m.log.cintura || m.log.abdomen)) tags.push(`<span class="hc-tag" style="color:#E89E0C; border-color:#E89E0C;">MEDIDAS</span>`);
            let html = `<div class="history-card"><div class="hc-header"><span class="hc-date">${dateStr}</span><div class="hc-badges">${tags.join('')}</div></div><div class="hc-grid">`;
            if (m.log && m.log.weight) {
                let w = parseFloat(m.log.weight); let bf = (((w - MASSA_MAGRA_BASE) / w) * 100).toFixed(1); let deltaStr = "--";
                let prevLog = allLogs.filter(l => new Date(l.date) < new Date(d) && l.weight).sort((a,b) => new Date(b.date) - new Date(a.date))[0];
                if (prevLog) { let delta = w - parseFloat(prevLog.weight); deltaStr = `${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg`; }
                html += `<div class="hc-item"><span class="lbl">Peso / BF%</span><span class="val">${w.toFixed(1)} kg <span style="font-size:12px; color:var(--text-sec); font-weight:500;">| ${bf}%</span></span></div><div class="hc-item"><span class="lbl">Variação (Δ)</span><span class="val accent">${deltaStr}</span></div><div class="hc-item"><span class="lbl">Massa Magra</span><span class="val">${MASSA_MAGRA_BASE} kg</span></div>`;
                let daysSinceStart = (new Date(d) - START_DATE) / (1000 * 60 * 60 * 24); let meta = Math.max(TARGET_WEIGHT, START_WEIGHT - (daysSinceStart * kgPerDay)).toFixed(1);
                html += `<div class="hc-item"><span class="lbl">Meta do Dia</span><span class="val">${meta} kg</span></div>`;
            }
            if (m.log && (m.log.kcal || m.log.prot)) html += `<div class="hc-item" style="grid-column: span 2; padding-top: 8px; border-top: 1px solid var(--border-light);"><span class="lbl">Nutrição</span><span class="val">${m.log.kcal||0} kcal | ${m.log.prot||0}g Prot</span></div>`;
            if (m.workout) html += `<div class="hc-item" style="grid-column: span 2; padding-top: 8px; border-top: 1px solid var(--border-light);"><span class="lbl">Treino Realizado</span><span class="val" style="color:var(--text-sec); font-size:14px; font-weight:600;">${WORKOUT_NAMES[m.workout.dayOfWeek]}</span></div>`;
            html += `</div></div>`; listEl.innerHTML += html;
        });
    },

    blobToBase64(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); }); },
    async base64ToBlob(base64Str) { const res = await fetch(base64Str); return await res.blob(); },
    async fullBackup() {
        const btn = document.getElementById('btn-backup-json'); btn.innerText = "GERANDO...";
        try {
            const logs = await DB.getAll('logs'); const workouts = await DB.getAll('workouts'); const photos = await DB.getAll('photos');
            const preparedPhotos = []; for (let p of photos) { if (p.blob) { const b64 = await this.blobToBase64(p.blob); preparedPhotos.push({ ...p, blob: null, base64: b64 }); } }
            const backupObj = { app: "CuttingTracker", version: 1, exportDate: new Date().toISOString(), logs: logs, workouts: workouts, photos: preparedPhotos };
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObj));
            const anchor = document.createElement('a'); anchor.setAttribute("href", dataStr); anchor.setAttribute("download", `cutting_backup_${new Date().toISOString().split('T')[0]}.json`); document.body.appendChild(anchor); anchor.click(); anchor.remove();
            btn.innerText = "FAZER BACKUP";
        } catch (e) { alert("Erro ao fazer backup: " + e.message); btn.innerText = "FAZER BACKUP"; }
    },
    async restoreBackup(event) {
        const file = event.target.files[0]; if (!file) return; const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const backup = JSON.parse(e.target.result); if(backup.app !== "CuttingTracker") throw new Error("Arquivo inválido.");
                if(!confirm("AVISO: Isso irá adicionar e substituir os dados atuais no aplicativo. Deseja continuar?")) { event.target.value = ''; return; }
                document.getElementById('btn-restore-click').innerText = "RESTAURANDO..."; let count = 0;
                if(backup.logs) for (let l of backup.logs) { await DB.put('logs', l); count++; }
                if(backup.workouts) for (let w of backup.workouts) { await DB.put('workouts', w); count++; }
                if(backup.photos) { for (let p of backup.photos) { if (p.base64) { const blob = await this.base64ToBlob(p.base64); await DB.put('photos', { ...p, base64: undefined, blob: blob }); count++; } } }
                alert(`Restauração Concluída!\n${count} registros processados.`); event.target.value = ''; document.getElementById('btn-restore-click').innerText = "RESTAURAR"; this.loadView('view-dashboard');
            } catch(err) { alert("Erro ao restaurar: " + err.message); event.target.value = ''; document.getElementById('btn-restore-click').innerText = "RESTAURAR"; }
        };
        reader.readAsText(file);
    },
    async exportCSV() {
        try {
            const logs = await DB.getAll('logs'); let csv = "Data,Peso,Kcal,Proteina,Carboidrato,Gordura,Agua,SonoHr,Cardio,Cintura,Abdomen\n";
            logs.forEach(l => { csv += `${l.date},${l.weight||''},${l.kcal||''},${l.prot||''},${l.carb||''},${l.fat||''},${l.water||''},${l['sleep-hrs']||''},${l.cardio||''},${l.cintura||''},${l.abdomen||''}\n`; });
            const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `cutting_tracker_export_${new Date().toISOString().split('T')[0]}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 100);
        } catch(e) { alert("Erro ao exportar CSV: " + e.message); }
    }
};

window.addEventListener('DOMContentLoaded', async () => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(e => console.log('SW falhou:', e));
    await DB.init(); UI.init();
});