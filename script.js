(() => {
  'use strict';
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const state = { caseText: '', language: 'en', structured: null, referral: null, queue: [] };
  const languages = { en: 'EN', hi: 'हि', gu: 'ગુ' };
  const samples = {
    fever: { label: 'Fever / onset', value: 'Recent fever or temperature change' },
    breathing: { label: 'Breathing concern', value: 'Breathlessness or respiratory concern' },
    history: { label: 'Relevant history', value: 'Medical history needs confirmation' },
    allergies: { label: 'Allergies', value: 'Allergy status not confirmed' },
    vitals: { label: 'Vitals', value: 'Vitals not documented' }
  };
  let toastTimer;

  function announce(message, type = 'success') {
    const region = $('.toast-region');
    if (!region) return;
    clearTimeout(toastTimer);
    region.innerHTML = `<div class="toast" role="status">${escapeHtml(message)}</div>`;
    toastTimer = setTimeout(() => { region.innerHTML = ''; }, 3500);
  }
  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char])); }
  function uid() { return `MR-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Date.now().toString(36).slice(-3).toUpperCase()}`; }
  function persist() { try { localStorage.setItem('mediroute-copilot', JSON.stringify(state)); } catch {} }
  function load() { try { Object.assign(state, JSON.parse(localStorage.getItem('mediroute-copilot') || '{}')); } catch {} }

  function analyzeCase(text) {
    const value = text.toLowerCase();
    const emergency = /severe|critical|unconscious|chest pain|oxygen|spo2|breathlessness|difficulty breathing|bleeding/.test(value);
    const breathing = /breath|respiratory|oxygen|spo2|cough/.test(value);
    const fever = /fever|temperature|tav|बुखार|તાવ/.test(value);
    const history = /history|diabetes|asthma|hypertension|surgery|diabetes|मधुमेह|દમ/.test(value);
    const allergies = /allerg|no known|nkda|एलर्जी|એલર્જી/.test(value);
    const vitals = /oxygen|spo2|bp|blood pressure|pulse|temperature|तापमान|બ્લડ પ્રેશર/.test(value);
    const signals = [];
    if (breathing) signals.push({ label: 'Respiratory concern', value: 'Breathing-related signal detected' });
    if (fever) signals.push({ label: 'Fever / onset', value: 'Fever or temperature signal detected' });
    if (history) signals.push({ label: 'Relevant history', value: 'Background condition mentioned' });
    if (!signals.length) signals.push({ label: 'Presenting concern', value: 'Case narrative captured for review' });
    const missing = [];
    if (!vitals) missing.push('Add current vital signs, especially oxygen saturation when relevant.');
    if (!history) missing.push('Confirm relevant medical history and current treatment.');
    if (!allergies) missing.push('Confirm allergies or document NKDA before sending.');
    if (!text.match(/duration|days?|since|for \\d|दिन|દિવસ/)) missing.push('Add symptom duration or onset.');
    const level = emergency ? 'Urgent assessment' : breathing ? 'Same-day specialist review' : 'Primary care review';
    const facility = breathing ? 'Maninagar Health Hub' : 'Shree Community Clinic';
    const specialist = breathing ? 'Pulmonology / respiratory care' : 'Internal medicine / primary care';
    return { signals, missing, emergency, level, facility, specialist, score: Math.max(61, 96 - missing.length * 8) };
  }

  function renderQuality(result) {
    $('#qualityPanel').classList.remove('is-hidden');
    $('#qualityScore').textContent = result.missing.length ? `${result.missing.length} gaps to review` : 'Ready to send';
    $('#signalList').innerHTML = result.signals.map(signal => `<div class="signal"><span>${escapeHtml(signal.label)}</span><b>${escapeHtml(signal.value)}</b></div>`).join('');
    $('#missingList').innerHTML = result.missing.length ? result.missing.map(item => `<li>${escapeHtml(item)}</li>`).join('') : '<li class="is-good">Core referral information looks complete.</li>';
    $('#recommendationPanel').classList.add('is-hidden');
    $('#referralPanel').classList.add('is-hidden');
    $('#qualityPanel').scrollIntoView({ behavior:'smooth', block:'start' });
  }

  function renderRecommendation() {
    const result = state.structured;
    $('#recommendationPanel').classList.remove('is-hidden');
    $('#urgencyBadge').textContent = result.emergency ? 'Urgent review' : 'Needs review';
    $('#urgencyBadge').className = `status-badge ${result.emergency ? 'status-badge-attention' : 'status-badge-neutral'}`;
    $('#careLevel').textContent = result.level;
    $('#careReason').textContent = result.emergency ? 'The case contains signals that require prompt human review.' : 'The recommendation is based on the structured case signals and documented context.';
    $('#facilityName').textContent = result.facility;
    $('#facilityMeta').textContent = `${result.specialist} · receiving team review`;
    $('#matchScore').textContent = `${result.score}% match`;
    $('#recommendationPanel').scrollIntoView({ behavior:'smooth', block:'start' });
  }

  function buildReferral() {
    const result = state.structured;
    state.referral = { id: uid(), createdAt: new Date().toISOString(), status: 'Draft ready', patient: 'Case under review', facility: result.facility };
    persist();
    $('#referralPanel').classList.remove('is-hidden');
    $('#referralPreview').innerHTML = `<dl><dt>Referral ID</dt><dd><strong>${state.referral.id}</strong></dd><dt>Reason for referral</dt><dd>${escapeHtml(result.signals.map(signal => signal.value).join('; '))}</dd><dt>Care level</dt><dd>${escapeHtml(result.level)}</dd><dt>Receiving team</dt><dd>${escapeHtml(result.facility)} · ${escapeHtml(result.specialist)}</dd><dt>Quality note</dt><dd>${result.missing.length ? `Review ${result.missing.length} information gap(s) before final submission.` : 'Core information is present for receiving-team review.'}</dd></dl>`;
    $('#referralPanel').scrollIntoView({ behavior:'smooth', block:'start' });
  }

  function caseSubmit(event) {
    event.preventDefault();
    const text = $('#caseStory').value.trim();
    if (!text) { announce('Add the patient case notes before structuring the referral.', 'error'); $('#caseStory').focus(); return; }
    state.caseText = text;
    state.structured = analyzeCase(text);
    persist();
    renderQuality(state.structured);
    announce('Case structured. Review the quality check before sending.');
  }

  function openReceiver() { if ($('#receiverModal').showModal) $('#receiverModal').showModal(); else $('#receiverModal').setAttribute('open',''); }
  function sendReferral() { if (!state.referral) return announce('Generate the referral packet first.', 'error'); state.referral.status = 'Awaiting receiving-team review'; persist(); announce(`${state.referral.id} sent securely to the receiving team.`); }
  function trackReferral() { if (!state.referral) return announce('Generate the referral packet first.', 'error'); state.referral.status = 'In review'; persist(); $('#draftId').textContent = state.referral.id; announce('Referral tracking started.'); document.querySelector('#queue')?.scrollIntoView({ behavior:'smooth' }); }
  function copyReferral() { if (!state.referral) return announce('Generate the referral packet first.', 'error'); navigator.clipboard?.writeText($('#referralPreview').innerText).then(() => announce('Referral packet copied.')).catch(() => announce('Select the referral packet and copy it manually.', 'warning')); }
  function resetCase() { state.caseText=''; state.structured=null; state.referral=null; persist(); $('#caseForm').reset(); $$('#qualityPanel,#recommendationPanel,#referralPanel').forEach(panel => panel.classList.add('is-hidden')); $('#draftId').textContent='MR-NEW-01'; $('#caseStory').focus(); announce('New referral draft started.'); }

  function filterQueue(filter) { $$('#queueBody tr').forEach(row => { row.hidden = filter !== 'all' && row.dataset.status !== filter; }); $$('.filter-tabs button').forEach(button => button.classList.toggle('is-active', button.dataset.filter === filter)); }
  function searchQueue(value) { const query=value.toLowerCase(); $$('#queueBody tr').forEach(row => { row.hidden = !row.innerText.toLowerCase().includes(query); }); }

  function init() {
    load();
    $('#caseForm').addEventListener('submit', caseSubmit);
    $('#continueButton').addEventListener('click', renderRecommendation);
    $('#generateButton').addEventListener('click', buildReferral);
    $('#sendReferralButton').addEventListener('click', sendReferral);
    $('#copyReferralButton').addEventListener('click', copyReferral);
    $('#trackReferralButton').addEventListener('click', trackReferral);
    $('#newCaseButton').addEventListener('click', resetCase);
    $('#editCaseButton').addEventListener('click', () => { $('#caseStory').focus(); $('#caseStory').scrollIntoView({ behavior:'smooth' }); });
    $('#changeReceiverButton').addEventListener('click', openReceiver);
    $('#messageReceiverButton').addEventListener('click', () => announce('Secure message composer opened for the receiving team.'));
    $('#syncButton').addEventListener('click', () => { $('#syncState').textContent='Synced just now'; announce('Offline drafts synced securely.'); });
    $('#voiceButton').addEventListener('click', () => { $('#caseStory').value += `${$('#caseStory').value ? '\n' : ''}Patient reports breathlessness and fatigue for three days.`; announce('Demo voice note added. Review the case before submitting.'); });
    $$('.filter-tabs button').forEach(button => button.addEventListener('click', () => filterQueue(button.dataset.filter)));
    $('#queueSearch').addEventListener('input', event => searchQueue(event.target.value));
    $$('.queue-open').forEach(button => button.addEventListener('click', () => announce('Referral opened for receiving-team review.')));
    $('#receiverModal form').addEventListener('submit', event => { if (event.submitter?.value === 'confirm') { event.preventDefault(); announce('Receiving team updated.'); $('#receiverModal').close(); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
})();
