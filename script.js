let currentSection = 'ALL'; 
let baseQuizData = [];       
let currentQuizData = [];   
let currentIndex = 0;
let userAnswers = [];
let correctCount = 0;
let currentWrongTab = 'wrong1'; 

// --- 1. QUẢN LÝ LOCALSTORAGE (TIẾN ĐỘ, LỊCH SỬ CÂU SAI, ÔN TẬP & THI THỬ) ---

const STORAGE_KEY_PROGRESS = 'acca_quiz_progress_v1';
const STORAGE_KEY_WRONG_HISTORY = 'acca_wrong_history_v2';
const STORAGE_KEY_REVISION_HISTORY = 'acca_revision_history';
const STORAGE_KEY_EXAM_HISTORY = 'acca_mock_exam_history';

function saveQuizProgress(currentIndex, userAnswers, score) {
    const progressData = {
        currentSection,
        currentIndex,
        userAnswers,
        score,
        timestamp: new Date().getTime()
    };
    localStorage.setItem(STORAGE_KEY_PROGRESS, JSON.stringify(progressData));
}

function loadQuizProgress() {
    const saved = localStorage.getItem(STORAGE_KEY_PROGRESS);
    if (!saved) return null;
    try {
        return JSON.parse(saved);
    } catch (e) {
        console.error("Lỗi đọc tiến độ:", e);
        return null;
    }
}

function clearQuizProgress() {
    localStorage.removeItem(STORAGE_KEY_PROGRESS);
}

// Lưu lịch sử ôn tập ngay khi người dùng tương tác/chọn đáp án
function saveRevisionHistoryToStorage() {
    const answeredCount = userAnswers.filter(a => a !== null).length;
    if (answeredCount === 0) return;

    const wrongCount = answeredCount - correctCount;
    const scoreRate = ((correctCount / currentQuizData.length) * 100).toFixed(1);

    let revisionHistory = [];
    try {
        revisionHistory = JSON.parse(localStorage.getItem(STORAGE_KEY_REVISION_HISTORY) || '[]');
    } catch (e) {
        revisionHistory = [];
    }

    const record = {
        date: new Date().toLocaleString(),
        section: currentSection,
        total: currentQuizData.length,
        answered: answeredCount,
        correct: correctCount,
        wrong: wrongCount < 0 ? 0 : wrongCount,
        scoreRate: scoreRate
    };

    revisionHistory.unshift(record);
    localStorage.setItem(STORAGE_KEY_REVISION_HISTORY, JSON.stringify(revisionHistory));
}

// Lưu lịch sử bài thi thử (Mock Exam) vào localStorage khi bấm Submit
function saveExamHistoryToStorage(examRecord) {
    let history = [];
    try {
        history = JSON.parse(localStorage.getItem(STORAGE_KEY_EXAM_HISTORY) || '[]');
    } catch (e) {
        history = [];
    }
    history.unshift(examRecord);
    localStorage.setItem(STORAGE_KEY_EXAM_HISTORY, JSON.stringify(history));
}

// Ghi nhận trạng thái trả lời: Tăng khi sai, Giảm khi đúng kèm theo xu hướng (trend)
function trackAnswerResult(questionId, questionText, sectionName, isCorrect) {
    let history = JSON.parse(localStorage.getItem(STORAGE_KEY_WRONG_HISTORY) || '{}');
    
    if (!history[questionId]) {
        history[questionId] = {
            id: questionId,
            text: questionText,
            section: sectionName || 'N/A',
            wrongCount: 0,
            trend: 'up' 
        };
    }

    if (!isCorrect) {
        history[questionId].wrongCount += 1;
        history[questionId].trend = 'up';
    } else {
        if (history[questionId].wrongCount > 0) {
            history[questionId].wrongCount -= 1;
            history[questionId].trend = 'down';
        }
    }

    if (history[questionId].wrongCount <= 0) {
        delete history[questionId];
    }

    localStorage.setItem(STORAGE_KEY_WRONG_HISTORY, JSON.stringify(history));
}

// Lọc danh sách theo Tab yêu cầu
function getFilteredWrongQuestions(tabType) {
    let history = JSON.parse(localStorage.getItem(STORAGE_KEY_WRONG_HISTORY) || '{}');
    let items = Object.values(history);

    if (tabType === 'wrong1') {
        return items.filter(item => item.wrongCount === 1);
    } else if (tabType === 'wrong2') {
        return items.filter(item => item.wrongCount === 2);
    } else if (tabType === 'wrongup3') {
        let filtered = items.filter(item => item.wrongCount >= 3);
        filtered.sort((a, b) => b.wrongCount - a.wrongCount);
        return filtered;
    }
    return [];
}

// --- 2. THUẬT TOÁN XÁO TRỘN & KHỞI TẠO QUIZ ---

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function prepareQuizData(dataToShuffle) {
    const clonedData = JSON.parse(JSON.stringify(dataToShuffle));
    const shuffledQuestions = shuffleArray(clonedData);

    return shuffledQuestions.map(q => {
        if (q.options && q.options.length > 0) {
            const correctOption = q.options[q.correct];
            const wrongOptions = shuffleArray(
                q.options.filter((_, idx) => idx !== q.correct)
            );
            let wrongIndex = 0;
            q.options = q.options.map((_, idx) =>
                idx === q.correct ? correctOption : wrongOptions[wrongIndex++]
            );
        }
        return q;
    });
}

function initQuiz() {
    if (typeof quizData === 'undefined') {
        console.error("Không tìm thấy biến quizData. Vui lòng kiểm tra lại file questions.js");
        return;
    }

    if (currentSection === 'ALL') {
        baseQuizData = JSON.parse(JSON.stringify(quizData));
    } else {
        baseQuizData = JSON.parse(JSON.stringify(quizData.filter(q => q.section === currentSection)));
    }

    currentQuizData = JSON.parse(JSON.stringify(baseQuizData));

    const savedProgress = loadQuizProgress();
    if (savedProgress && savedProgress.currentSection === currentSection && savedProgress.userAnswers && savedProgress.userAnswers.length === currentQuizData.length) {
        currentIndex = savedProgress.currentIndex || 0;
        userAnswers = savedProgress.userAnswers;
        correctCount = savedProgress.score || 0;
    } else {
        userAnswers = new Array(currentQuizData.length).fill(null);
        currentIndex = 0;
        correctCount = 0;
    }

    setupJumpSelect();
    renderQuestion();
    updateMeta();
}

function changeSection(sectionValue) {
    currentSection = sectionValue;
    clearQuizProgress();
    initQuiz();
}

function setupJumpSelect() {
    const select = document.getElementById('jump-select');
    if (!select) return;
    select.innerHTML = '';

    if (currentQuizData.length === 0) {
        document.getElementById('question-container').innerHTML = `
            <div class="text-center py-12 text-slate-500">
                <p class="text-lg font-medium">No questions found in ${currentSection}.</p>
            </div>
        `;
        document.getElementById('meta-total').innerText = `Total: 0`;
        document.getElementById('meta-answered').innerText = `Completed: 0/0`;
        document.getElementById('meta-score').innerText = `Score: 0`;
        document.getElementById('page-indicator').innerText = `Number 0 / 0`;
        document.getElementById('btn-prev').disabled = true;
        document.getElementById('btn-next').disabled = true;
        return;
    }

    currentQuizData.forEach((q, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.text = `Number ${idx + 1}`;
        select.appendChild(opt);
    });

    document.getElementById('meta-total').innerText = `Total: ${currentQuizData.length}`;
}

function resetStateAndRender() {
    clearQuizProgress();
    userAnswers = new Array(currentQuizData.length).fill(null);
    currentIndex = 0;
    correctCount = 0;

    setupJumpSelect();
    renderQuestion();
    updateMeta();
}

function resetQuiz() {
    currentQuizData = JSON.parse(JSON.stringify(baseQuizData));
    resetStateAndRender();
}

function resetAndShuffleQuiz() {
    currentQuizData = prepareQuizData(baseQuizData);
    resetStateAndRender();
}

// --- 3. HIỂN THỊ CÂU HỎI VÀ XỬ LÝ TƯƠNG TÁC ---

function renderQuestion() {
    if (currentQuizData.length === 0) return;

    const container = document.getElementById('question-container');
    const q = currentQuizData[currentIndex];
    const selectedOpt = userAnswers[currentIndex];
    const hasAnswered = selectedOpt !== null;

    let html = `
        <div class="mb-4 flex items-center justify-between">
            <div class="flex items-center gap-2">
                <span class="text-xs font-semibold px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full uppercase tracking-wider">Number ${currentIndex + 1} / ${currentQuizData.length}</span>
                ${q.section ? `<span class="text-xs font-semibold px-3 py-1 bg-slate-100 text-slate-600 rounded-full">${q.section}</span>` : ''}
            </div>
            ${hasAnswered ? `<span class="text-xs font-bold px-3 py-1 rounded-full ${selectedOpt === q.correct ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">${selectedOpt === q.correct ? '✓ True' : '✕ False'}</span>` : ''}
        </div>
        <h2 class="text-lg md:text-xl font-normal text-slate-800 mb-4 leading-relaxed">${q.question}</h2>
    `;

    if (q.statements && q.statements.length > 0) {
        html += `<div class="mb-6 space-y-3 text-slate-700 text-sm md:text-base leading-relaxed">`;
        q.statements.forEach(stmt => {
            html += `<div>${stmt}</div>`;
        });
        html += `</div>`;
    }

    if (q.questionTable) {
        html += `<div class="mb-4 overflow-x-auto"><table class="min-w-full border border-slate-300 text-left text-sm">`;
        html += `<thead class="bg-slate-100 font-semibold text-slate-700"><tr>`;
        q.questionTable.headers.forEach(h => {
            html += `<th class="border border-slate-300 px-4 py-2">${h}</th>`;
        });
        html += `</tr></thead><tbody>`;
        q.questionTable.rows.forEach(row => {
            html += `<tr>`;
            row.forEach(cell => {
                html += `<td class="border border-slate-300 px-4 py-2 text-slate-700">${cell}</td>`;
            });
            html += `</tr>`;
        });
        html += `</tbody></table></div>`;
    }

    if (q.subQuestion) {
        html += `<p class="text-base font-semibold text-slate-800 mb-4">${q.subQuestion}</p>`;
    }

    if (q.optionTable) {
        html += `<div class="mb-6 overflow-x-auto"><table class="min-w-full border border-slate-300 text-center text-sm">`;
        html += `<thead class="bg-slate-100 font-bold text-slate-700"><tr>`;
        q.optionTable.headers.forEach(h => {
            html += `<th class="border border-slate-300 px-4 py-2">${h}</th>`;
        });
        html += `</tr></thead><tbody>`;
        q.optionTable.rows.forEach(row => {
            html += `<tr>`;
            row.forEach((cell, cellIdx) => {
                const alignClass = cellIdx === 0 ? 'font-semibold text-slate-900' : 'text-slate-700';
                html += `<td class="border border-slate-300 px-4 py-2 ${alignClass}">${cell}</td>`;
            });
            html += `</tr>`;
        });
        html += `</tbody></table></div>`;
    }

    html += `<div class="space-y-3">`;
    const optionLetters = ['A', 'B', 'C', 'D'];

    q.options.forEach((opt, idx) => {
        const letter = optionLetters[idx];
        let borderClass = 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40';
        let bgClass = 'bg-white';
        let textClass = 'text-slate-700';
        let badgeClass = 'bg-slate-100 text-slate-600 border border-slate-200';

        if (hasAnswered) {
            if (idx === q.correct) {
                borderClass = 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500';
                textClass = 'text-emerald-900 font-semibold';
                badgeClass = 'bg-emerald-600 text-white';
            } else if (selectedOpt === idx && idx !== q.correct) {
                borderClass = 'border-rose-500 bg-rose-50 ring-1 ring-rose-500';
                textClass = 'text-rose-900 font-semibold';
                badgeClass = 'bg-rose-600 text-white';
            }
        } else {
            if (selectedOpt === idx) {
                borderClass = 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/20';
                textClass = 'text-indigo-900 font-semibold';
                badgeClass = 'bg-indigo-600 text-white';
            }
        }

        html += `
            <div onclick="${hasAnswered ? '' : `selectAnswer(${idx})`}" class="flex items-start p-3 rounded-xl border ${borderClass} ${bgClass} ${hasAnswered ? 'cursor-default' : 'cursor-pointer'} transition shadow-sm">
                <div class="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold uppercase mr-3 transition ${badgeClass}">
                    ${letter}
                </div>
                <span class="text-sm md:text-base ${textClass} self-center">${opt}</span>
            </div>
        `;
    });

    html += `</div>`;

    if (hasAnswered) {
        const isCorrect = selectedOpt === q.correct;
        html += `
            <div class="mt-6 p-4 rounded-xl ${isCorrect ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-rose-50 border border-rose-200 text-rose-900'}">
                <div class="font-semibold mb-1 flex items-center gap-2">
                    <span>${isCorrect ? '🎉 Great choice, you got it right!' : '💡 The correct answer is: ' + optionLetters[q.correct] + '. ' + q.options[q.correct]}</span>
                </div>
                <p class="text-sm mt-2 leading-relaxed opacity-90 explanation"><strong class="font-medium">📝 Detailed breakdown: </strong> ${q.explanation}</p>
            </div>
        `;
    }

    container.innerHTML = html;

    document.getElementById('btn-prev').disabled = currentIndex === 0;
    document.getElementById('btn-next').disabled = currentIndex === currentQuizData.length - 1;
    document.getElementById('page-indicator').innerText = `Number ${currentIndex + 1} / ${currentQuizData.length}`;
    document.getElementById('jump-select').value = currentIndex;
}

function selectAnswer(optionIndex) {
    if (userAnswers[currentIndex] !== null) return;
    userAnswers[currentIndex] = optionIndex;
    
    const q = currentQuizData[currentIndex];
    const isCorrect = optionIndex === q.correct;

    if (isCorrect) {
        correctCount++;
    }

    const questionId = q.id || `Number_${currentIndex + 1}`;
    trackAnswerResult(questionId, q.question, q.section || currentSection, isCorrect);

    updateMeta();
    saveQuizProgress(currentIndex, userAnswers, correctCount);
    
    // Lưu lịch sử ôn tập ngay khi user chọn đáp án
    saveRevisionHistoryToStorage();

    renderQuestion();
}

function nextQuestion() {
    if (currentIndex < currentQuizData.length - 1) {
        currentIndex++;
        saveQuizProgress(currentIndex, userAnswers, correctCount);
        renderQuestion();
    }
}

function prevQuestion() {
    if (currentIndex > 0) {
        currentIndex--;
        saveQuizProgress(currentIndex, userAnswers, correctCount);
        renderQuestion();
    }
}

function jumpToQuestion(index) {
    currentIndex = parseInt(index);
    saveQuizProgress(currentIndex, userAnswers, correctCount);
    renderQuestion();
}

function updateMeta() {
    const answeredCount = userAnswers.filter(a => a !== null).length;
    document.getElementById('meta-answered').innerText = `Answered: ${answeredCount}/${currentQuizData.length}`;
    document.getElementById('meta-score').innerText = `Correct: ${correctCount}`;
}

function submitQuiz() {
    const answeredCount = userAnswers.filter(a => a !== null).length;
    
    // Cập nhật lần cuối khi submit bài ôn tập
    saveRevisionHistoryToStorage();

    const modal = document.getElementById('results-modal');
    const resultText = document.getElementById('result-text');
    resultText.innerHTML = `You answered: <strong class="text-indigo-600">${answeredCount} / ${currentQuizData.length}</strong> Question.<br>Correct answers: <strong class="text-emerald-600">${correctCount} Number</strong><br>Accuracy rate: <strong class="text-blue-600">${((correctCount/currentQuizData.length)*100).toFixed(1)}%</strong>`;
    if(modal) modal.classList.remove('hidden');
    clearQuizProgress();
}

function closeResults() {
    const modal = document.getElementById('results-modal');
    if(modal) modal.classList.add('hidden');
}

// --- 4. CHUYỂN TAB VÀ RENDER BẢNG LỊCH SỬ (ÁP DỤNG CÙNG KHUNG CỐ ĐỊNH CHO CẢ MOCK EXAM) ---

function switchWrongTab(tabName) {
    currentWrongTab = tabName;
    
    ['wrong1', 'wrong2', 'wrongup3', 'mockexam'].forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        if (!btn) return;
        if (t === tabName) {
            btn.className = "px-4 py-2 text-sm font-semibold rounded-t-xl transition bg-white text-indigo-600 border-t border-x border-slate-200 shadow-sm shrink-0";
        } else {
            btn.className = "px-4 py-2 text-sm font-semibold rounded-t-xl transition text-slate-600 hover:text-slate-900 hover:bg-slate-100 shrink-0";
        }
    });

    renderWrongQuestionsReview();
}

function renderWrongQuestionsReview() {
    const tableBody = document.getElementById('wrong-questions-table-body');
    if (!tableBody) return;

    // TRƯỜNG HỢP: TAB MOCK EXAM - Áp dụng đúng 4 cột cố định (Status, Section, Question, Action)
    if (currentWrongTab === 'mockexam') {
        let examHistory = [];
        try {
            examHistory = JSON.parse(localStorage.getItem(STORAGE_KEY_EXAM_HISTORY) || '[]');
        } catch (e) {
            examHistory = [];
        }

        if (examHistory.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center py-10 text-slate-400 text-sm">
                        Chưa có lịch sử thi thử nào được ghi nhận. Hãy bấm nút Mock Exam để bắt đầu! 📝
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = '';
        const totalExams = examHistory.length;
        
        examHistory.forEach((record, index) => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-50 transition-colors';
            const attemptNo = totalExams - index;

            let statusBadge = `
                <div class="flex items-center justify-center gap-1.5">
                    <span class="inline-block px-2.5 py-1 text-xs font-bold bg-indigo-50 text-indigo-700 rounded-md">Lần ${attemptNo}</span>
                </div>
            `;

            let sectionBadge = `
                <span class="inline-block px-2.5 py-1 text-xs font-semibold bg-slate-100 text-slate-700 rounded-md border border-slate-200">
                    Mock ${attemptNo}
                </span>
            `;

            let questionInfo = `
                <div class="font-semibold text-slate-900">
                    True: <span class="text-emerald-600">${record.correct}</span> / False: <span class="text-rose-600">${record.wrong}</span>
                </div>
                <div class="text-xs font-normal text-slate-500 mt-0.5">${record.date || ''}</div>
            `;

            // Tính điểm theo thang 100 điểm cho 15 câu (hoặc record.total)
            let totalQ = record.total || 15;
            let score10 = ((record.correct / totalQ) * 10).toFixed(1);

            let actionItem = `
                <span class="font-bold text-orange-600 text-sm">${score10} đ</span>               
            `;

            row.innerHTML = `
                <td class="p-3 text-center border-b border-slate-100 align-middle">${statusBadge}</td>
                <td class="p-3 border-b border-slate-100 align-middle">${sectionBadge}</td>
                <td class="p-3 border-b border-slate-100 align-middle">${questionInfo}</td>
                <td class="p-3 text-right border-b border-slate-100 align-middle">${actionItem}</td>
            `;
            tableBody.appendChild(row);
        });
        return;
    }

    // TRƯỜNG HỢP: CÁC TAB CÂU SAI THÔNG THƯỜNG (wrong1, wrong2, wrongup3)
    const wrongList = getFilteredWrongQuestions(currentWrongTab); 

    if (wrongList.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-10 text-slate-400 text-sm">
                    No records found for this category. Keep up the good work! 🚀
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = '';

    wrongList.forEach((item) => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50 transition-colors';

        let timesText = item.wrongCount === 1 ? '1' : `${item.wrongCount}`;
        let arrowHtml = item.trend === 'up' 
            ? `<span class="text-red-600 ml-1.5"><i class="fa-solid fa-angles-up"></i></span>` 
            : `<span class="text-emerald-600 ml-1.5"><i class="fa-solid fa-angles-down"></i></span>`;

        let statusBadge = `
            <div class="flex items-center justify-center gap-1.5">
                <span class="inline-block px-2.5 py-1 text-xs font-bold bg-rose-100 text-rose-700 rounded-md">${timesText}</span>
                ${arrowHtml}
            </div>
        `;
        
        row.innerHTML = `
            <td class="p-3 text-center border-b border-slate-100 align-middle">
                ${statusBadge}
            </td>
            <td class="p-3 border-b border-slate-100 align-middle">
                <span class="inline-block px-2.5 py-1 text-xs font-semibold bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100">
                    ${item.section || 'N/A'}
                </span>
            </td>
            <td class="p-3 border-b border-slate-100 font-semibold text-slate-900 align-middle">
                <div>Number ${item.id}</div>
                <div class="text-xs font-thin italic text-slate-600 mt-0.5 line-clamp-1 sm:line-clamp-2 max-w-xs sm:max-w-md">${item.text}</div>
            </td>
            <td class="p-3 text-right border-b border-slate-100 align-middle">
                <button onclick="openQuestionDetail('${item.id}')" class="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-semibold text-xs rounded-lg transition border border-indigo-200 shadow-sm">
                    View
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// --- 5. LOGIC THI THỬ (MOCK EXAM) ---

let examQuestions = [];
let examCurrentIndex = 0;
let examUserAnswers = [];
let examTimerInterval = null;
let examTimeLeft = 1800; // 30 phút

function startMockExam() {
    if (typeof quizData === 'undefined' || quizData.length === 0) {
        alert("Chưa tải được dữ liệu câu hỏi.");
        return;
    }

    const sectionsMap = {};
    quizData.forEach(q => {
        const sec = q.section || 'General';
        if (!sectionsMap[sec]) sectionsMap[sec] = [];
        sectionsMap[sec].push(q);
    });

    const sectionKeys = Object.keys(sectionsMap);
    let selectedQuestions = [];
    const targetTotal = 16;
    
    let baseCountPerSection = Math.floor(targetTotal / sectionKeys.length);
    let remainder = targetTotal % sectionKeys.length;

    sectionKeys.forEach((sec, idx) => {
        let countToTake = baseCountPerSection + (idx < remainder ? 1 : 0);
        let shuffledSecQuestions = shuffleArray([...sectionsMap[sec]]);
        selectedQuestions = selectedQuestions.concat(shuffledSecQuestions.slice(0, countToTake));
    });

    examQuestions = shuffleArray(selectedQuestions).slice(0, targetTotal);
    examUserAnswers = new Array(examQuestions.length).fill(null);
    examCurrentIndex = 0;

    const qContainer = document.getElementById('question-container');
    const tToolbar = document.getElementById('main-quiz-toolbar');
    const tFooter = document.getElementById('main-quiz-footer');
    const mScreen = document.getElementById('mock-exam-screen');

    if(qContainer) qContainer.classList.add('hidden');
    if(tToolbar) tToolbar.classList.add('hidden');
    if(tFooter) tFooter.classList.add('hidden');
    if(mScreen) mScreen.classList.remove('hidden');

    examTimeLeft = 1800;
    startExamTimer();
    renderExamQuestion();
}

function startExamTimer() {
    if (examTimerInterval) clearInterval(examTimerInterval);
    
    const timerDisplay = document.getElementById('exam-timer');
    examTimerInterval = setInterval(() => {
        if (examTimeLeft <= 0) {
            clearInterval(examTimerInterval);
            alert("Hết thời gian làm bài!");
            submitMockExam();
            return;
        }
        examTimeLeft--;
        let minutes = Math.floor(examTimeLeft / 60);
        let seconds = examTimeLeft % 60;
        if(timerDisplay) {
            timerDisplay.innerText = `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        }
    }, 1000);
}

function renderExamQuestion() {
    if (examQuestions.length === 0) return;

    const container = document.getElementById('exam-question-container');
    if (!container) return;
    
    const q = examQuestions[examCurrentIndex];
    const selectedOpt = examUserAnswers[examCurrentIndex];

    let html = `
        <div class="mb-3 flex items-center justify-between">
            <span class="text-xs font-semibold px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full uppercase">Question ${examCurrentIndex + 1} / ${examQuestions.length}</span>
            <span class="text-xs font-semibold px-3 py-1 bg-slate-100 text-slate-600 rounded-full">${q.section || 'General'}</span>
        </div>
        <h3 class="text-base sm:text-lg font-medium text-slate-900 mb-4 leading-relaxed">${q.question}</h3>
    `;

    const subQ = q['sub-Question'] || q.subQuestion;
    if (subQ) {
        html += `<p class="text-xs sm:text-sm font-semibold text-slate-800 mb-3">${subQ}</p>`;
    }

    html += `<div class="space-y-2.5">`;
    const optionLetters = ['A', 'B', 'C', 'D'];
    if (q.options && Array.isArray(q.options)) {
        q.options.forEach((opt, idx) => {
            const letter = optionLetters[idx];
            const isSelected = selectedOpt === idx;
            let borderClass = isSelected ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-500/20 font-semibold text-indigo-950' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700';

            html += `
                <div onclick="selectExamAnswer(${idx})" class="flex items-start p-3 rounded-xl border ${borderClass} cursor-pointer transition shadow-sm text-sm sm:text-base">
                    <div class="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold uppercase mr-3 ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}">
                        ${letter}
                    </div>
                    <span class="self-center leading-normal">${opt}</span>
                </div>
            `;
        });
    }
    html += `</div>`;

    container.innerHTML = html;

    const btnPrev = document.getElementById('exam-btn-prev');
    const btnNext = document.getElementById('exam-btn-next');
    const pageInd = document.getElementById('exam-page-indicator');

    if(btnPrev) btnPrev.disabled = examCurrentIndex === 0;
    if(btnNext) btnNext.disabled = examCurrentIndex === examQuestions.length - 1;
    if(pageInd) pageInd.innerText = `Question ${examCurrentIndex + 1} / ${examQuestions.length}`;
}

function selectExamAnswer(optionIndex) {
    examUserAnswers[examCurrentIndex] = optionIndex;
    renderExamQuestion();
}

function examNextQuestion() {
    if (examCurrentIndex < examQuestions.length - 1) {
        examCurrentIndex++;
        renderExamQuestion();
    }
}

function examPrevQuestion() {
    if (examCurrentIndex > 0) {
        examCurrentIndex--;
        renderExamQuestion();
    }
}

// LƯU KẾT QUẢ VÀO STORAGE KHI BẤM NỘP BÀI (SUBMIT MOCK EXAM)
function submitMockExam() {
    if (examTimerInterval) clearInterval(examTimerInterval);

    let correctCount = 0;
    let wrongCount = 0;

    examQuestions.forEach((q, idx) => {
        if (examUserAnswers[idx] === q.correct) {
            correctCount++;
        } else {
            wrongCount++;
        }
    });

    saveExamHistoryToStorage({
        date: new Date().toLocaleString(),
        total: examQuestions.length,
        correct: correctCount,
        wrong: wrongCount,
        scoreRate: ((correctCount / examQuestions.length) * 100).toFixed(1)
    });

    const detailsContainer = document.getElementById('exam-result-details');
    if(detailsContainer) {
        detailsContainer.innerHTML = `
            <div class="flex justify-between py-1 border-b border-slate-100"><span>Tổng số câu hỏi:</span> <strong class="text-slate-900">${examQuestions.length} câu</strong></div>
            <div class="flex justify-between py-1 border-b border-slate-100"><span>Số câu trả lời đúng:</span> <strong class="text-emerald-600">${correctCount} câu</strong></div>
            <div class="flex justify-between py-1 border-b border-slate-100"><span>Số câu trả lời sai:</span> <strong class="text-rose-600">${wrongCount} câu</strong></div>
            <div class="flex justify-between py-1"><span>Tỷ lệ chính xác:</span> <strong class="text-blue-600">${((correctCount / examQuestions.length) * 100).toFixed(1)}%</strong></div>
            <div class="mt-3 p-3 bg-indigo-50 text-indigo-900 rounded-lg text-xs font-medium text-center">🎉 Chúc mừng bạn đã hoàn thành bài thi thử Mock Exam! Lịch sử đã được lưu lại thành công.</div>
        `;
    }

    const examResModal = document.getElementById('exam-result-modal');
    if(examResModal) examResModal.classList.remove('hidden');
}

function quitMockExam() {
    if (confirm("Bạn có chắc chắn muốn thoát bài thi thử không?")) {
        if (examTimerInterval) clearInterval(examTimerInterval);
        const mScreen = document.getElementById('mock-exam-screen');
        const qContainer = document.getElementById('question-container');
        const tToolbar = document.getElementById('main-quiz-toolbar');
        const tFooter = document.getElementById('main-quiz-footer');

        if(mScreen) mScreen.classList.add('hidden');
        if(qContainer) qContainer.classList.remove('hidden');
        if(tToolbar) tToolbar.classList.remove('hidden');
        if(tFooter) tFooter.classList.remove('hidden');
    }
}

function closeExamResult() {
    const examResModal = document.getElementById('exam-result-modal');
    const mScreen = document.getElementById('mock-exam-screen');
    const qContainer = document.getElementById('question-container');
    const tToolbar = document.getElementById('main-quiz-toolbar');
    const tFooter = document.getElementById('main-quiz-footer');

    if(examResModal) examResModal.classList.add('hidden');
    if(mScreen) mScreen.classList.add('hidden');
    if(qContainer) qContainer.classList.remove('hidden');
    if(tToolbar) tToolbar.classList.remove('hidden');
    if(tFooter) tFooter.classList.remove('hidden');
    initQuiz();
}

// --- 6. MODAL XEM CHI TIẾT CÂU HỎI ---

function openQuestionDetail(questionId) {
    let foundQuestion = null;
    const cleanId = String(questionId).trim();
    const dataPool = (typeof quizData !== 'undefined' && quizData.length > 0) ? quizData : baseQuizData;

    if (dataPool && dataPool.length > 0) {
        foundQuestion = dataPool.find(q => q.id && String(q.id).trim() === cleanId);

        if (!foundQuestion) {
            const matchNumber = cleanId.match(/\d+/);
            if (matchNumber) {
                const indexNum = parseInt(matchNumber[0]) - 1;
                if (indexNum >= 0 && indexNum < dataPool.length) {
                    foundQuestion = dataPool[indexNum];
                }
            }
        }

        if (!foundQuestion) {
            foundQuestion = dataPool.find(q => JSON.stringify(q).includes(cleanId));
        }
    }

    const modal = document.getElementById('question-detail-modal');
    const contentContainer = document.getElementById('detail-modal-content');
    const titleContainer = document.getElementById('detail-modal-title');

    if (!modal || !contentContainer) return;

    if (!foundQuestion) {
        contentContainer.innerHTML = `<p class="text-red-500 font-medium text-center py-6 text-sm">Question details not found for ID: ${questionId}.</p>`;
    } else {
        if (titleContainer) titleContainer.innerText = `Detail: ${questionId} (${foundQuestion.section || 'N/A'})`;

        let html = `
            <div class="mb-3 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="text-[11px] sm:text-xs font-semibold px-2.5 py-0.5 bg-indigo-50 text-indigo-600 rounded-full uppercase tracking-wider">${foundQuestion.id || questionId}</span>
                    ${foundQuestion.section ? `<span class="text-[11px] sm:text-xs font-semibold px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-full">${foundQuestion.section}</span>` : ''}
                </div>
                <span class="text-[11px] sm:text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Reference Mode</span>
            </div>
            <h2 class="text-sm sm:text-base font-medium text-slate-800 mb-3 leading-relaxed">${foundQuestion.question}</h2>
        `;

        if (foundQuestion.statements && foundQuestion.statements.length > 0) {
            html += `<div class="mb-4 space-y-2 text-slate-700 text-xs sm:text-sm leading-relaxed">`;
            foundQuestion.statements.forEach(stmt => {
                html += `<div>${stmt}</div>`;
            });
            html += `</div>`;
        }

        if (foundQuestion.questionTable) {
            html += `<div class="mb-4 overflow-x-auto"><table class="min-w-full border border-slate-300 text-left text-xs sm:text-sm">`;
            html += `<thead class="bg-slate-100 font-semibold text-slate-700"><tr>`;
            foundQuestion.questionTable.headers.forEach(h => {
                html += `<th class="border border-slate-300 px-3 py-1.5">${h}</th>`;
            });
            html += `</tr></thead><tbody>`;
            foundQuestion.questionTable.rows.forEach(row => {
                html += `<tr>`;
                row.forEach(cell => {
                    html += `<td class="border border-slate-300 px-3 py-1.5 text-slate-700">${cell}</td>`;
                });
                html += `</tr>`;
            });
            html += `</tbody></table></div>`;
        }

        const subQ = foundQuestion['sub-Question'] || foundQuestion.subQuestion;
        if (subQ) {
            html += `<p class="text-xs sm:text-sm font-semibold text-slate-800 mb-3">${subQ}</p>`;
        }

        if (foundQuestion.optionTable) {
            html += `<div class="mb-4 overflow-x-auto"><table class="min-w-full border border-slate-300 text-center text-xs sm:text-sm">`;
            html += `<thead class="bg-slate-100 font-bold text-slate-700"><tr>`;
            foundQuestion.optionTable.headers.forEach(h => {
                html += `<th class="border border-slate-300 px-3 py-1.5">${h}</th>`;
            });
            html += `</tr></thead><tbody>`;
            foundQuestion.optionTable.rows.forEach(row => {
                html += `<tr>`;
                row.forEach((cell, cellIdx) => {
                    const alignClass = cellIdx === 0 ? 'font-semibold text-slate-900' : 'text-slate-700';
                    html += `<td class="border border-slate-300 px-3 py-1.5 ${alignClass}">${cell}</td>`;
                });
                html += `</tr>`;
            });
            html += `</tbody></table></div>`;
        }

        html += `<div class="space-y-2 mt-3">`;
        const optionLetters = ['A', 'B', 'C', 'D'];

        if (foundQuestion.options && Array.isArray(foundQuestion.options)) {
            foundQuestion.options.forEach((opt, idx) => {
                const letter = optionLetters[idx];
                const isCorrect = idx === foundQuestion.correct;
                
                let borderClass = 'border-slate-200 bg-white';
                let textClass = 'text-slate-700';
                let badgeClass = 'bg-slate-100 text-slate-600 border border-slate-200';

                if (isCorrect) {
                    borderClass = 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500';
                    textClass = 'text-emerald-900 font-semibold';
                    badgeClass = 'bg-emerald-600 text-white';
                }

                html += `
                    <div class="flex items-start p-2.5 rounded-xl border ${borderClass} shadow-sm text-xs sm:text-sm">
                        <div class="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold uppercase mr-2.5 ${badgeClass}">
                            ${letter}
                        </div>
                        <span class="${textClass} self-center leading-normal">${opt} ${isCorrect ? ' <strong class="text-emerald-700 font-bold">(Correct Answer)</strong>' : ''}</span>
                    </div>
                `;
            });
        }
        html += `</div>`;

        if (foundQuestion.explanation) {
            html += `
                <div class="mt-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm">
                    <div class="font-semibold mb-1 flex items-center gap-1.5">
                        <span>💡 Explanation:</span>
                    </div>
                    <p class="mt-1.5 leading-relaxed opacity-90">${foundQuestion.explanation}</p>
                </div>
            `;
        }

        contentContainer.innerHTML = html;
    }

    modal.classList.remove('hidden');
}

function closeQuestionDetailModal() {
    const modal = document.getElementById('question-detail-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// --- 7. KHỞI CHẠY & GẮN SỰ KIỆN DOM ---

window.onload = function() {
    initQuiz();
};

document.addEventListener('DOMContentLoaded', () => {
    const btnToggle = document.getElementById('btn-toggle-wrong-history');
    const btnClose = document.getElementById('btn-close-wrong-history');
    const modal = document.getElementById('wrong-history-modal');

    if (btnToggle && modal) {
        btnToggle.addEventListener('click', () => {
            currentWrongTab = 'wrong1'; 
            switchWrongTab('wrong1');
            modal.classList.remove('hidden');
        });
    }

    if (btnClose && modal) {
        btnClose.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    }
});
