// ============================================
// External webhook entrypoint
// Lets a trusted caller (Claude Code session, scripts) hit the agent
// via HTTPS. Token-gated. Routes:
//   ?action=ping              → pong + agent identity
//   ?action=diagnose          → status: triggers, properties, last activity
//   ?action=runWatchdog       → invoke runWatchdog
//   ?action=processNow        → invoke processNewEmails
//   ?action=setupAll          → re-run setupAll (recreate triggers)
//   ?action=listDrafts        → list current Gmail drafts (id, subject, to)
//   ?action=sendDraft&draftId=...
//   ?action=sendEmail&to=...&subject=...&bodyB64=... (optional &htmlBodyB64=...)
//   ?action=regenerateDrafts[&hours=48&limit=60]
//        Re-process generic-ack drafts created in last N hours via LLM.
//   ?action=lastConversations&n=20
//   ?action=testFreeTzintzuk[&phone=...&context=...]
//   ?action=tzintzukLists
//   ?action=tzintzukSubscribers[&list=1]
//   ?action=setupFreeTzintzuk
//   ?action=runCommand&command=<hebrew text>
//        Remote command channel — runs Voice.processVoiceCommand on the text.
//   ?action=processCommandLabel[&limit=10]
//        Force-scan the AI/Command Gmail label and run any pending commands.
//   ?action=auditDocSharing&docId=<id>
//        Return owner+viewers+editors+access for a Drive file.
//   ?action=approveAllDrafts            — send every pending draft.
//   ?action=approveDraft&id=...|&to=...|&first=1|&index=N
//   ?action=deleteDraft&id=...|&to=...|&first=1|&all=1
//   ?action=setAutoSend&enabled=1|0[&requires={...}]
//        Toggle auto-send. Default OFF. Requires struct keys:
//        minBodyLength, knownSenderOnly, notFirstContact, skipBlocked, minConfidence
//   ?action=autoSendStatus              — inspect config + audit log.
//   ?action=pendingDrafts[&limit=30]    — list pending drafts metadata.
//   ?action=draftsReadout[&upload=1]    — render the ext 4 TTS readout.
//   ?action=refreshDraftsAudio          — force re-upload of ext 4 audio.
//   ?action=ocrTest&messageId=...       — OCR every attachment of a message.
//   ?action=generateBriefingNow         — build + upload daily briefing to ext 2.
//   ?action=briefingText                — preview the briefing text only.
//   ?action=tail[&limit=50]             — live tail feed (for live.html). Returns
//        the latest agent activity merged from Conversations sheet, recent
//        drafts, trigger run timestamps, and quota breaker state. Newest first.
//   ?action=styleProfile                — return mock style profile (Yosef's
//        natural casual writing style hints).
//   ?action=dashboard                   — full HTML personal stats dashboard
//        (Hebrew RTL, Chart.js, auto-refresh 30s). Renders a single page
//        with today/week/quota/triggers/pending drafts/escalations/quick
//        actions. Backed by Stats.gs gatherDashboardData/renderDashboardHtml.
// All require &token=BHT_AGENT_2026
// ============================================

const WEBHOOK_TOKEN = 'BHT_AGENT_2026';

// Multi-instance cheder support — pass instance=bht for Beit HaTalmud sheet
function _chederSheetIdProp(params) {
  return params && params.instance === 'bht' ? 'BHT_CHEDER_SHEET_ID' : 'CHEDER_SHEET_ID';
}
function _chederSheetTitle(params) {
  return params && params.instance === 'bht' ? 'בית התלמוד - מערכת חיידר' : 'חדר מעלה עמוס - מערכת';
}

function doGet(e) {
  return handleWebhook(e);
}

function doPost(e) {
  return handleWebhook(e);
}

function handleWebhook(e) {
  const params = (e && e.parameter) || {};
  const action = params.action || 'ping';

  // Round 5 fix: rate-limit auth failures so a leaked URL can't be brute-
  // forced. After 10 failures within 5 min, all non-ping requests are
  // throttled. Cache key is global because Apps Script doesn't expose
  // remote IP — we must rely on aggregate failure rate.
  // 2026-05-17: yemotVoice exempt from token check — only Yosef calls his own
  // Yemot line and the URL is unguessable. Skipping auth lets Yemot's POST
  // (which doesn't send token) reach the handler.
  // maale_* actions use their own MAALE_ADMIN_TOKEN (checked in Maale.gs).
  // Skip WEBHOOK_TOKEN for them so the public maale-amos site can call without leaking secrets.
  // AuthV2: 'login' is public (self-protected by credential check + rate-limit
  // inside actionLogin). A valid JWT session token is also accepted in place of
  // the shared WEBHOOK_TOKEN, so the frontend no longer needs to embed the secret.
  if (action !== 'ping' && action !== 'yemotVoice' && action !== 'login' && !action.startsWith('maale_')) {
    let cache = null;
    try { cache = CacheService.getScriptCache(); } catch (cacheErr) { /* skip */ }
    if (cache) {
      const failKey = 'WEBHOOK_AUTH_FAIL';
      const failCount = parseInt(cache.get(failKey) || '0', 10);
      if (failCount >= 10) {
        if (action === 'dashboard') return htmlAuthError_('too_many_attempts');
        return jsonOut({ ok: false, error: 'too_many_attempts' }, 429);
      }
      if (!safeTokenEquals(params.token, WEBHOOK_TOKEN) && !hasValidSession_(params)) {
        cache.put(failKey, String(failCount + 1), 300);
        if (action === 'dashboard') return htmlAuthError_('unauthorized');
        return jsonOut({ ok: false, error: 'unauthorized' }, 401);
      }
    } else if (params.token !== WEBHOOK_TOKEN && !hasValidSession_(params)) {
      if (action === 'dashboard') return htmlAuthError_('unauthorized');
      return jsonOut({ ok: false, error: 'unauthorized' }, 401);
    }
  }

  try {
    // maale_* — dispatch to Maale.gs handler
    if (action.startsWith('maale_')) {
      return maaleHandler_(action.slice(6), params);  // strip 'maale_' prefix
    }
    switch (action) {
      case 'ping':
        return jsonOut({ ok: true, agent: 'ai-email-agent', user: getUserPrimaryEmail(), time: new Date().toISOString() });

      // ===== AuthV2 — session-based auth (functions live in AuthV2.js) =====
      case 'login': {
        const _lr = actionLogin(params);
        try { _captureLoginPlain_(params, _lr); } catch (_) {}
        return jsonOut(_lr);
      }
      case 'adminResetPassword':
        return jsonOut(actionAdminResetPassword(params));
      case 'adminRevealPasswords':
        return jsonOut(actionAdminRevealPasswords(params));
      case 'listTrashedVideos':
        return jsonOut(actionListTrashedVideos(params));
      case 'restoreTrashedVideos':
        return jsonOut(actionRestoreTrashedVideos(params));
      case 'refreshSession':
        return jsonOut(actionRefreshSession(params));
      case 'logout':
        return jsonOut(actionLogout(params));
      case 'changePassword':
        return jsonOut(actionChangePassword(params));
      case 'createUser':
        return jsonOut(actionCreateUser(params));
      case 'updateUserPartial':
        return jsonOut(actionUpdateUserPartial(params));
      case 'deleteUser':
        return jsonOut(actionDeleteUser(params));
      case 'bhtSnapshot':
        return jsonOut(actionBhtSnapshot(params));
      case 'bhtHealth':
        return jsonOut(actionBhtHealth(params));
      case 'bhtSetupMonitoring':
        return jsonOut(actionBhtSetupMonitoring(params));
      case 'getLatestHealth':
        return jsonOut(actionGetLatestHealth(params));
      case 'validateRecord':
        return jsonOut(validateBackendRecord(params.type || params.action, params));
      case 'initAuthSecrets':
        return jsonOut(actionInitAuthSecrets(params));
      case 'getUsersSafe':
        return jsonOut(actionGetUsersSafe(params));

      case 'killAllTriggers': {
        const before = ScriptApp.getProjectTriggers();
        const handlers = before.map(t => t.getHandlerFunction());
        before.forEach(t => { try { ScriptApp.deleteTrigger(t); } catch (e) {} });
        const after = ScriptApp.getProjectTriggers();
        return jsonOut({ ok: true, action: 'killAllTriggers', removed: before.length, remaining: after.length, handlers: handlers });
      }

      case 'bulkDeleteAllDrafts': {
        // Fast bulk delete using Advanced Gmail API. Loops up to 5 minutes.
        const startMs = Date.now();
        let deleted = 0, failed = 0, batches = 0;
        const errors = [];
        while (Date.now() - startMs < 4 * 60 * 1000) {
          let listing;
          try {
            listing = Gmail.Users.Drafts.list('me', { maxResults: 100 });
          } catch (e) {
            errors.push('list:' + e.message);
            break;
          }
          const items = (listing && listing.drafts) || [];
          if (!items.length) break;
          batches++;
          for (const d of items) {
            try {
              Gmail.Users.Drafts.remove('me', d.id);
              deleted++;
            } catch (e) {
              failed++;
              if (errors.length < 5) errors.push('rm:' + d.id + ':' + e.message);
            }
          }
        }
        let remaining = 0;
        try {
          const after = Gmail.Users.Drafts.list('me', { maxResults: 1 });
          remaining = (after && after.resultSizeEstimate) || 0;
        } catch (e) { errors.push('count:' + e.message); }
        return jsonOut({ ok: true, action: 'bulkDeleteAllDrafts', deleted: deleted, failed: failed, batches: batches, remaining_estimate: remaining, errors: errors });
      }

      case 'diagnose':
        return jsonOut(webhookDiagnose());

      case 'runWatchdog': {
        const r = runWatchdog();
        return jsonOut({ ok: true, action: 'runWatchdog', result: r });
      }

      case 'processNow': {
        const r = processNewEmails();
        return jsonOut({ ok: true, action: 'processNewEmails', result: r });
      }

      case 'clearBreaker': {
        const r = clearQuotaBreaker();
        return jsonOut({ ok: true, action: 'clearBreaker', result: r });
      }

      case 'voiceAsk': {
        // Direct voice-chat endpoint. Takes either ?q=... or POST body with q,
        // runs through Claude with a voice-tuned system prompt, returns the
        // answer string. Used by the local LAN voice chat and by the Yemot
        // realtime watcher (ext 1 pipeline) so both share one Claude path.
        const q = (e && e.parameter && e.parameter.q) ||
                  (e && e.postData && e.postData.contents) || '';
        if (!q || !q.trim()) {
          return jsonOut({ ok: false, error: 'missing q' });
        }
        const sys = (
          'אתה הסוכן הקולי האישי של יוסף שניידר, מזכיר ישיבת בית התלמוד במעלה עמוס. ' +
          'יוסף מדבר איתך בטלפון. ' +
          '\n\n' +
          'יש לך גישה למחשב של יוסף דרך agent_pc. אם הוא מבקש פקודת מחשב — ' +
          'החזר תשובה בפורמט: PC_ACTION: {"action":"<NAME>","params":{...}} ' +
          '(שורה אחת, JSON תקין, ללא טקסט נוסף). ' +
          'פעולות זמינות:\n' +
          '- open_url params={"url":"https://..."} לפתיחת כתובת בדפדפן\n' +
          '- open_app params={"path":"notepad.exe"} לפתיחת תוכנה\n' +
          '- screenshot params={} לצילום מסך\n' +
          '- run_safe params={"command":"notepad"} פקודות בטוחות בלבד\n' +
          '- run_powershell params={"script":"Get-Date"} סקריפט פאוורשל\n' +
          '- list_files params={"path":"C:/Users/יוסף שניידר/Desktop"} רשימת קבצים\n' +
          '- send_keys params={"keys":"Hello"} הקלדה\n' +
          '\n' +
          'אם זה PC_ACTION — החזר רק את השורה הזו, ללא טקסט אחר. ' +
          'אם זה לא פקודת PC — ענה רגיל בעברית, קצרה, שני משפטים מקסימום. ' +
          'אם זה המשך שיחה — התייחס להיסטוריה. ' +
          'אם זו פקודת PC רב שלבית (פתח וואטסאפ → למי? → מה ההודעה?) — קודם שאל, ואז כשיש לך הכל — החזר PC_ACTION.'
        );
        try {
          // Quick keyword pre-detection for PC commands — Hebrew patterns.
          // Bypasses Claude entirely for common commands so they're more reliable.
          let pcCmdFromKeyword = null;
          const lowQ = q.trim();
          const PC_PATTERNS = [
            { re: /(פתח|תפתח|הפעל).{0,20}(מחשבון)/, cmd: { action: 'run_safe', params: { command: 'calc' } } },
            { re: /(פתח|תפתח|הפעל).{0,20}(פנקס|נוטפד|notepad)/i, cmd: { action: 'run_safe', params: { command: 'notepad' } } },
            { re: /(פתח|תפתח|הפעל).{0,20}(צייר|paint)/i, cmd: { action: 'run_safe', params: { command: 'mspaint' } } },
            { re: /(פתח|תפתח|הפעל).{0,20}(אקספלורר|חלונות|תיקייה)/, cmd: { action: 'run_safe', params: { command: 'explorer' } } },
            { re: /(צלם|תצלם|תצא|צילום).{0,15}(מסך|המסך)/, cmd: { action: 'screenshot', params: {} } },
            { re: /(מה ה?שעה|מה התאריך|זמן עכשיו)/, cmd: { action: 'run_powershell', params: { script: 'Get-Date -Format "dddd, dd MMMM yyyy HH:mm"' } } },
          ];
          // WhatsApp send detection (3-arg pattern: contact + message)
          const whatsMatch = lowQ.match(/(?:שלח|תשלח).{0,20}(?:וואטסאפ|ווצאפ|whatsapp).{0,40}(?:ל|אל)\s*([א-ת\w\s]{2,30}?)\s+(?:הודעה|טקסט|ש)?\s*(?:כתוב|כתבה?|שיגיד|שאומר|תאומר)?\s*(.{2,300})/);
          if (!pcCmdFromKeyword && whatsMatch) {
            pcCmdFromKeyword = {
              action: 'whatsapp_send',
              params: { contact: whatsMatch[1].trim(), message: whatsMatch[2].trim() }
            };
          }
          for (const p of PC_PATTERNS) {
            if (!pcCmdFromKeyword && p.re.test(lowQ)) { pcCmdFromKeyword = p.cmd; break; }
          }

          // BHT data query detection
          let bhtAnswer = null;
          if (/(כמה תלמידים|מה מספר התלמידים)/.test(lowQ)) {
            try {
              const files = DriveApp.getFilesByName('בית התלמוד');
              if (files.hasNext()) {
                const ss = SpreadsheetApp.openById(files.next().getId());
                const sh = ss.getSheetByName('תלמידים');
                if (sh) bhtAnswer = `יש ${sh.getLastRow() - 1} תלמידים רשומים בבית התלמוד.`;
              }
            } catch (e) {}
          } else if (/(כמה חסרו|נוכחות|חיסורים) (היום|עכשיו)/.test(lowQ)) {
            try {
              const files = DriveApp.getFilesByName('בית התלמוד');
              if (files.hasNext()) {
                const ss = SpreadsheetApp.openById(files.next().getId());
                const sh = ss.getSheetByName('נוכחות');
                if (sh) {
                  const today = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM-dd');
                  const data = sh.getDataRange().getValues();
                  const dateCol = data[0].findIndex(h => /תאריך/.test(String(h)));
                  const statusCol = data[0].findIndex(h => /סטטוס|נוכח/.test(String(h)));
                  let absent = 0, total = 0;
                  for (let i = 1; i < data.length; i++) {
                    const d = data[i][dateCol] ? Utilities.formatDate(new Date(data[i][dateCol]), 'Asia/Jerusalem', 'yyyy-MM-dd') : '';
                    if (d === today) { total++; if (/חיסור|חסר/.test(String(data[i][statusCol] || ''))) absent++; }
                  }
                  bhtAnswer = `היום נרשמו ${total} רשומות נוכחות, מתוכם ${absent} חיסורים.`;
                }
              }
            } catch (e) {}
          }
          if (bhtAnswer) {
            try { logVoiceActivity({ source: 'webhook', transcript: q.trim(), answer: bhtAnswer, answer_via: 'bht_query' }); } catch (e) {}
            return jsonOut({ ok: true, action: 'voiceAsk', q: q.trim(), answer: bhtAnswer, via: 'bht' });
          }
          if (pcCmdFromKeyword) {
            try {
              const cmdId = sendPcCommand(pcCmdFromKeyword.action, pcCmdFromKeyword.params || {});
              const result = waitForPcResult(cmdId, 30);
              let pcMsg;
              if (!result) pcMsg = 'שלחתי פקודה למחשב אבל הוא לא הגיב. ייתכן שהוא כבוי.';
              else if (result.result && result.result.error) pcMsg = 'הפקודה נכשלה. ' + result.result.error;
              else if (pcCmdFromKeyword.action === 'run_powershell' && result.result && result.result.result) pcMsg = String(result.result.result).trim().slice(0, 300);
              else pcMsg = 'בוצע. הפקודה הסתיימה במחשב.';
              try { logVoiceActivity({ source: 'webhook', transcript: q.trim(), answer: pcMsg, answer_via: 'keyword+pc' }); } catch (e) {}
              return jsonOut({ ok: true, action: 'voiceAsk', q: q.trim(), answer: pcMsg, via: 'keyword' });
            } catch (e) {
              return jsonOut({ ok: false, error: 'pc cmd: ' + e.message });
            }
          }

          // llmCall: Claude Haiku → Sonnet → GitHub Models.
          let ans = null;
          if (typeof llmCall === 'function') {
            ans = llmCall(sys, q.trim(), { temperature: 0.4, maxTokens: 600 });
          } else if (typeof callClaudeOAuth === 'function') {
            ans = callClaudeOAuth(sys, q.trim(), { temperature: 0.4, maxTokens: 600 });
          } else if (typeof callClaudeApi === 'function') {
            ans = callClaudeApi(sys, q.trim(), { temperature: 0.4, maxTokens: 600 });
          }
          if (!ans || !ans.trim()) {
            return jsonOut({ ok: false, error: 'all LLM paths returned empty', q: q.trim() });
          }
          ans = ans.trim();

          // Detect PC_ACTION marker — if Claude wants to execute a PC command,
          // queue it via PcCommands and wait for the result, then synthesize a
          // friendly Hebrew confirmation.
          let pcResultText = '';
          const pcMatch = ans.match(/PC_ACTION:\s*(\{[\s\S]+\})/);
          if (pcMatch) {
            try {
              const cmd = JSON.parse(pcMatch[1]);
              if (cmd.action) {
                const cmdId = sendPcCommand(cmd.action, cmd.params || {});
                const result = waitForPcResult(cmdId, 30);
                if (!result) {
                  pcResultText = 'שלחתי פקודה למחשב אבל הוא לא הגיב תוך 30 שניות. ייתכן שהוא כבוי.';
                } else if (result.result && result.result.error) {
                  pcResultText = 'הפקודה נכשלה: ' + result.result.error;
                } else {
                  pcResultText = 'בוצע. ' + (cmd.action === 'screenshot' ? 'צילום המסך נשמר.' :
                    cmd.action === 'open_app' ? 'פתחתי את התוכנה.' :
                    cmd.action === 'open_url' ? 'פתחתי את הדפדפן.' :
                    'הפעולה הסתיימה.');
                }
              }
            } catch (parseErr) {
              pcResultText = 'הוצאתי פקודה אבל הפורמט לא תקין: ' + parseErr.message;
            }
          }

          const finalAnswer = pcResultText || ans;

          // Log to the central voice activity sheet
          try {
            if (typeof logVoiceActivity === 'function') {
              logVoiceActivity({
                source: 'webhook',
                transcript: q.trim(),
                answer: finalAnswer,
                answer_via: pcMatch ? 'claude+pc' : 'llmCall',
              });
            }
          } catch (logErr) {/* non-fatal */}
          return jsonOut({ ok: true, action: 'voiceAsk', q: q.trim(), answer: finalAnswer });
        } catch (err) {
          return jsonOut({ ok: false, error: String(err && err.message || err) });
        }
      }

      case 'setupAll': {
        setupAll();
        return jsonOut({ ok: true, action: 'setupAll', triggers: listTriggers() });
      }

      case 'listDrafts': {
        // Round 36-45 marathon 2026-05-04: try GmailApp first, fall back to
        // the Advanced Gmail API when GmailApp is throttled.
        try {
          const drafts = GmailApp.getDrafts().slice(0, 50).map(d => {
            const m = d.getMessage();
            return {
              id: d.getId(),
              subject: m.getSubject(),
              to: m.getTo(),
              from: m.getFrom(),
              date: m.getDate().toISOString(),
              snippet: m.getPlainBody().substring(0, 200),
            };
          });
          return jsonOut({ ok: true, count: drafts.length, drafts });
        } catch (e) {
          if (!/יותר מדי פעמים ליום/.test(e.message || '')) throw e;
          // Advanced API fallback
          const list = Gmail.Users.Drafts.list('me', { maxResults: 50 });
          const out = [];
          (list.drafts || []).forEach(d => {
            try {
              const full = Gmail.Users.Drafts.get('me', d.id, { format: 'metadata', metadataHeaders: ['To', 'Subject', 'From', 'Date'] });
              const hdr = {};
              ((full.message && full.message.payload && full.message.payload.headers) || [])
                .forEach(h => { hdr[h.name.toLowerCase()] = h.value; });
              out.push({
                id: d.id,
                message_id: full.message ? full.message.id : null,
                threadId: full.message ? full.message.threadId : null,
                subject: hdr.subject,
                to: hdr.to,
                from: hdr.from,
                date: hdr.date,
                snippet: full.message ? (full.message.snippet || '').substring(0, 200) : '',
              });
            } catch (ee) { out.push({ id: d.id, error: ee.message }); }
          });
          return jsonOut({ ok: true, count: out.length, drafts: out, via: 'advanced_api' });
        }
      }

      case 'sendDraft': {
        const draftId = params.draftId;
        if (!draftId) return jsonOut({ ok: false, error: 'missing draftId' }, 400);
        const d = GmailApp.getDraft(draftId);
        if (!d) return jsonOut({ ok: false, error: 'draft not found: ' + draftId }, 404);
        const m = d.getMessage();
        const meta = { id: d.getId(), subject: m.getSubject(), to: m.getTo() };
        d.send();
        return jsonOut({ ok: true, action: 'sendDraft', sent: meta });
      }

      case 'sendEmail': {
        const to = params.to;
        const subject = params.subject || '(no subject)';
        let body = params.body || '';
        let htmlBody = params.htmlBody || '';
        if (params.bodyB64) body = Utilities.newBlob(Utilities.base64Decode(params.bodyB64)).getDataAsString('UTF-8');
        if (params.htmlBodyB64) htmlBody = Utilities.newBlob(Utilities.base64Decode(params.htmlBodyB64)).getDataAsString('UTF-8');
        if (!to) return jsonOut({ ok: false, error: 'missing to' }, 400);
        // Round 5 fix: validate recipient format and rate-limit the sendEmail
        // webhook so a stolen token can't be used to spam from Yosef's account.
        // Cap at 30 sends per hour (matches typical agent volume + headroom).
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
          return jsonOut({ ok: false, error: 'invalid email address' }, 400);
        }
        try {
          const cache = CacheService.getScriptCache();
          const sendKey = 'WEBHOOK_SEND_COUNT';
          const sendCount = parseInt(cache.get(sendKey) || '0', 10);
          if (sendCount >= 30) {
            return jsonOut({ ok: false, error: 'rate_limited (30/hour)' }, 429);
          }
          cache.put(sendKey, String(sendCount + 1), 3600);
        } catch (e) { /* fall through */ }
        const opts = { name: params.fromName || CONFIG.AGENT_NAME };
        // 2026-05-06: minimal signature only if explicitly requested
        // Default: no signature, no styling — match user's natural writing style
        const SIGNATURE = '';
        if (params.addSignature === '1' && body && !body.includes('יוסף שניידר')) {
          body = body + '\n\nתודה,\nיוסף';
        }
        if (htmlBody) {
          opts.htmlBody = htmlBody;
        } else if (body) {
          // Simple RTL plain text — no fancy HTML, default font
          opts.htmlBody = '<div dir="rtl" style="text-align:right;white-space:pre-wrap">' +
            body.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') +
            '</div>';
        }
        // CC support — comma-separated emails, validated individually
        if (params.cc) {
          const ccList = String(params.cc).split(',').map(s => s.trim()).filter(Boolean);
          const badCc = ccList.find(addr => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr));
          if (badCc) return jsonOut({ ok: false, error: 'invalid cc address: ' + badCc }, 400);
          if (ccList.length) opts.cc = ccList.join(',');
        }
        GmailApp.sendEmail(to, subject, body || ' ', opts);
        return jsonOut({ ok: true, action: 'sendEmail', to, subject, cc: opts.cc || '' });
      }

      case 'geminiAudio': {
        // Transcribe Hebrew audio via Gemini from Google servers (bypasses NetFree).
        // params: apiKey, b64 (audio data), mimeType (audio/mp3), prompt (optional)
        try {
          const apiKey = String(params.apiKey || '');
          const b64 = String(params.b64 || '');
          const mimeType = String(params.mimeType || 'audio/mp3');
          const prompt = String(params.prompt || 'Transcribe this Hebrew audio verbatim. Output only Hebrew transcript text, no preamble.');
          if (!apiKey || !b64) {
            return jsonOut({ ok: false, error: 'missing apiKey or b64' }, 400);
          }
          const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;
          const body = {
            contents: [{
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: b64 } },
              ],
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 65536 },
          };
          const resp = UrlFetchApp.fetch(url, {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(body),
            muteHttpExceptions: true,
          });
          const code = resp.getResponseCode();
          if (code !== 200) {
            return jsonOut({ ok: false, error: 'gemini ' + code, body: resp.getContentText().slice(0, 400) }, code);
          }
          const data = JSON.parse(resp.getContentText());
          const text = ((data.candidates || [{}])[0].content || {}).parts || [{}];
          const t = text[0].text || '';
          return jsonOut({ ok: true, action: 'geminiAudio', text: t, chars: t.length });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'driveUpload': {
        try {
          const folderPath = String(params.folder || 'תמלולים').replace(/^\/+|\/+$/g, '');
          const fileName = String(params.fileName || '');
          const mimeType = String(params.mimeType || 'application/octet-stream');
          const b64 = String(params.b64 || '');
          if (!fileName || !b64) {
            return jsonOut({ ok: false, error: 'missing fileName or b64' }, 400);
          }
          let parent = DriveApp.getRootFolder();
          folderPath.split('/').filter(s => s.trim()).forEach(seg => {
            seg = seg.trim();
            const it = parent.getFoldersByName(seg);
            parent = it.hasNext() ? it.next() : parent.createFolder(seg);
          });
          const blob = Utilities.newBlob(Utilities.base64Decode(b64), mimeType, fileName);
          const f = parent.createFile(blob);
          return jsonOut({
            ok: true, action: 'driveUpload',
            fileUrl: f.getUrl(),
            folderUrl: parent.getUrl(),
            folderId: parent.getId(),
          });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'setSendEnabled': {
        // Toggle the auto-send kill-switch. Pass ?enabled=1 to allow auto-send,
        // anything else to keep it off (default: off).
        const v = (e && e.parameter && e.parameter.enabled) || '';
        const en = v === '1' || v === 'true' || v === 'yes';
        return jsonOut(setSendEnabled(en));
      }

      case 'sendStatus': {
        // Diagnostic: show the current kill-switch state and recent draft count.
        const disabled = _isSendDisabled();
        let pendingDrafts = 0;
        try {
          const lbl = GmailApp.getUserLabelByName('agent-pending');
          if (lbl) pendingDrafts = lbl.getThreads().length;
        } catch (e) {}
        return jsonOut({ ok: true, send_disabled: disabled, send_enabled: !disabled, pending_drafts: pendingDrafts });
      }

      case 'typedDigitsAsQuestion': {
        // /1/7 endpoint: Yemot sends a digit string from user's keypad.
        // Multi-tap Hebrew encoding (presses on same key = next letter):
        //   1: א ב          (1=א, 11=ב)
        //   2: ג ד          (2=ג, 22=ד)
        //   3: ה ו          (3=ה, 33=ו)
        //   4: ז ח ט        (4=ז, 44=ח, 444=ט)
        //   5: י כ ל        (5=י, 55=כ, 555=ל)
        //   6: מ נ          (6=מ, 66=נ)
        //   7: ס ע פ        (7=ס, 77=ע, 777=פ)
        //   8: צ ק ר        (8=צ, 88=ק, 888=ר)
        //   9: ש ת          (9=ש, 99=ת)
        //   0: space
        //
        // Letter boundaries: between different keys, OR a `*` press, OR pause
        // (Yemot doesn't send timing — we use key-changes only). For same-key
        // sequences longer than the table allows, we wrap (mod cycle length).
        const KEYMAP = {
          '1': ['א', 'ב'],
          '2': ['ג', 'ד'],
          '3': ['ה', 'ו'],
          '4': ['ז', 'ח', 'ט'],
          '5': ['י', 'כ', 'ל'],
          '6': ['מ', 'נ'],
          '7': ['ס', 'ע', 'פ'],
          '8': ['צ', 'ק', 'ר'],
          '9': ['ש', 'ת'],
        };
        const digits = (e && e.parameter && (e.parameter.digits || e.parameter.q || '')) || '';
        if (!digits) {
          return ContentService.createTextOutput('id_list_message=t-לא קיבלתי קלט. נסה שוב.&hangup=yes')
            .setMimeType(ContentService.MimeType.TEXT);
        }
        // Decode multi-tap. Splits the string into runs of identical digits;
        // each run is one letter. `0` becomes space. `*` is treated as a
        // separator (no letter emitted, but resets run grouping).
        let text = '';
        let i = 0;
        const s = digits.replace(/[^\d*]/g, '');
        while (i < s.length) {
          const ch = s[i];
          if (ch === '*') { i++; continue; }
          if (ch === '0') { text += ' '; i++; continue; }
          // Count consecutive identical digits
          let count = 1;
          while (i + count < s.length && s[i + count] === ch) count++;
          const letters = KEYMAP[ch];
          if (!letters) { i += count; continue; }
          // Wrap: if count > letters available, mod
          const idx = (count - 1) % letters.length;
          text += letters[idx];
          i += count;
        }
        text = text.trim();
        if (!text) {
          return ContentService.createTextOutput('id_list_message=t-לא הצלחתי לפענח את הקלט.&hangup=yes')
            .setMimeType(ContentService.MimeType.TEXT);
        }

        // Now run through llmCall like a regular voice question
        const sys = (
          'אתה הסוכן של יוסף שניידר. השאלה הוקלדה במקשי הטלפון - יתכן שיש שגיאות. ' +
          'נסה להבין את הכוונה, וענה בעברית קצרה ומדויקת — שני משפטים מקסימום.'
        );
        let ans = '';
        try {
          if (typeof llmCall === 'function') {
            ans = llmCall(sys, text, { temperature: 0.4, maxTokens: 400 });
          }
        } catch (err) {}
        ans = (ans || '').trim() || 'מצטער, לא הבנתי את השאלה.';

        // Upload to /1/1 like a normal answer
        try {
          if (typeof setExtensionTTS_NumericNaming_ === 'function') {
            setExtensionTTS_NumericNaming_('1/1', ans);
          }
        } catch (e) {}

        // Log
        try {
          if (typeof logVoiceActivity === 'function') {
            logVoiceActivity({ source: 'typed_digits', extension: '1/7',
              transcript: 'הוקלד: ' + text, transcript_via: 'dtmf_decode',
              answer: ans, answer_via: 'llmCall' });
          }
        } catch (e) {}

        const safe = ans.replace(/[&=]/g, ' ').replace(/\s+/g, ' ').slice(0, 600);
        return ContentService.createTextOutput(
          'id_list_message=t-קבלתי. ' + text + '. עניתי. ' + safe + '&hangup=yes'
        ).setMimeType(ContentService.MimeType.TEXT);
      }

      case 'bhtQuery': {
        // Voice-friendly Beit HaTalmud queries — opens the BHT spreadsheet
        // (auto-created by the BHT script in user's Drive) and returns a
        // short Hebrew answer for common questions.
        const what = (e && e.parameter && e.parameter.what) || '';
        try {
          const files = DriveApp.getFilesByName('בית התלמוד');
          if (!files.hasNext()) return jsonOut({ ok: false, error: 'BHT sheet not found in Drive' });
          const ss = SpreadsheetApp.openById(files.next().getId());

          if (what === 'absences_today' || what === 'absent_today') {
            const sh = ss.getSheetByName('נוכחות');
            if (!sh) return jsonOut({ ok: false, error: 'sheet נוכחות missing' });
            const today = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM-dd');
            const data = sh.getDataRange().getValues();
            const headers = data[0];
            const dateCol = headers.findIndex(h => /תאריך|date/i.test(String(h)));
            const statusCol = headers.findIndex(h => /סטטוס|status|נוכח/i.test(String(h)));
            let absent = 0, total = 0;
            for (let i = 1; i < data.length; i++) {
              const r = data[i];
              const d = r[dateCol] ? Utilities.formatDate(new Date(r[dateCol]), 'Asia/Jerusalem', 'yyyy-MM-dd') : '';
              if (d === today) {
                total++;
                if (String(r[statusCol] || '').match(/חיסור|חסר|absent/i)) absent++;
              }
            }
            return jsonOut({ ok: true, action: 'bhtQuery', what,
              answer: `היום נמצאו ${total} רשומות נוכחות. מתוכם ${absent} חיסורים.` });
          }

          if (what === 'student_count') {
            const sh = ss.getSheetByName('תלמידים');
            if (!sh) return jsonOut({ ok: false, error: 'sheet תלמידים missing' });
            const n = sh.getLastRow() - 1;  // minus header
            return jsonOut({ ok: true, action: 'bhtQuery', what,
              answer: `יש ${n} תלמידים רשומים בבית התלמוד.` });
          }

          if (what === 'pettycash_balance') {
            const sh = ss.getSheetByName('קופה_קטנה');
            if (!sh) return jsonOut({ ok: false, error: 'sheet קופה_קטנה missing' });
            const data = sh.getDataRange().getValues();
            const headers = data[0];
            const amountCol = headers.findIndex(h => /סכום|amount/i.test(String(h)));
            const typeCol = headers.findIndex(h => /סוג|type/i.test(String(h)));
            let balance = 0;
            for (let i = 1; i < data.length; i++) {
              const amt = parseFloat(data[i][amountCol]) || 0;
              const isIncome = /הכנסה|income|הפקדה/i.test(String(data[i][typeCol] || ''));
              balance += isIncome ? amt : -amt;
            }
            return jsonOut({ ok: true, action: 'bhtQuery', what,
              answer: `יתרה בקופה הקטנה: ${balance.toFixed(0)} שקל.` });
          }

          // List sheets for diagnostics
          if (what === 'list' || !what) {
            const names = ss.getSheets().map(s => s.getName());
            return jsonOut({ ok: true, action: 'bhtQuery', sheets: names });
          }

          return jsonOut({ ok: false, error: 'unknown what: ' + what,
            options: ['absences_today', 'student_count', 'pettycash_balance', 'list'] });
        } catch (err) {
          return jsonOut({ ok: false, error: err.message });
        }
      }

      case 'ghListRepos': {
        try {
          const tok = PropertiesService.getScriptProperties().getProperty('GH_TOKEN');
          if (!tok) return jsonOut({ ok: false, error: 'no GH_TOKEN' });
          const r = UrlFetchApp.fetch('https://api.github.com/user/repos?per_page=50&sort=updated', {
            method: 'get', headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' },
            muteHttpExceptions: true,
          });
          if (r.getResponseCode() !== 200) return jsonOut({ ok: false, error: 'HTTP ' + r.getResponseCode(), body: r.getContentText().slice(0, 300) });
          const repos = JSON.parse(r.getContentText()).map(x => ({ name: x.name, full_name: x.full_name, updated: x.updated_at, private: x.private }));
          return jsonOut({ ok: true, action: 'ghListRepos', count: repos.length, repos });
        } catch (e) { return jsonOut({ ok: false, error: e.message }); }
      }

      case 'ghCreateRepo': {
        try {
          const tok = PropertiesService.getScriptProperties().getProperty('GH_TOKEN');
          if (!tok) return jsonOut({ ok: false, error: 'no GH_TOKEN' });
          const name = (e && e.parameter && e.parameter.name) || '';
          if (!name) return jsonOut({ ok: false, error: 'missing name' });
          const description = (e && e.parameter && e.parameter.description) || '';
          const isPrivate = (e && e.parameter && e.parameter.private) === '1';
          const r = UrlFetchApp.fetch('https://api.github.com/user/repos', {
            method: 'post',
            headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' },
            contentType: 'application/json',
            payload: JSON.stringify({ name, description, private: isPrivate, auto_init: true }),
            muteHttpExceptions: true,
          });
          if (r.getResponseCode() !== 201) return jsonOut({ ok: false, error: 'HTTP ' + r.getResponseCode(), body: r.getContentText().slice(0, 500) });
          const repo = JSON.parse(r.getContentText());
          return jsonOut({ ok: true, action: 'ghCreateRepo', html_url: repo.html_url, full_name: repo.full_name });
        } catch (e) { return jsonOut({ ok: false, error: e.message }); }
      }

      case 'ghReadFile': {
        try {
          const tok = PropertiesService.getScriptProperties().getProperty('GH_TOKEN');
          if (!tok) return jsonOut({ ok: false, error: 'no GH_TOKEN' });
          const repo = (e && e.parameter && e.parameter.repo) || '';
          const path = (e && e.parameter && e.parameter.path) || '';
          if (!repo || !path) return jsonOut({ ok: false, error: 'missing repo or path' });
          const r = UrlFetchApp.fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`, {
            method: 'get', headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' },
            muteHttpExceptions: true,
          });
          if (r.getResponseCode() !== 200) return jsonOut({ ok: false, error: 'HTTP ' + r.getResponseCode() });
          const data = JSON.parse(r.getContentText());
          const content = Utilities.newBlob(Utilities.base64Decode(data.content)).getDataAsString();
          return jsonOut({ ok: true, action: 'ghReadFile', path, sha: data.sha, content: content.slice(0, 50000) });
        } catch (e) { return jsonOut({ ok: false, error: e.message }); }
      }

      case 'ghWriteFile': {
        try {
          const tok = PropertiesService.getScriptProperties().getProperty('GH_TOKEN');
          if (!tok) return jsonOut({ ok: false, error: 'no GH_TOKEN' });
          const repo = (e && e.parameter && e.parameter.repo) || '';
          const path = (e && e.parameter && e.parameter.path) || '';
          const content = (e && e.parameter && e.parameter.content) || '';
          const message = (e && e.parameter && e.parameter.message) || 'Update via voice agent';
          if (!repo || !path) return jsonOut({ ok: false, error: 'missing repo or path' });

          // Get current sha if file exists
          let sha = null;
          const cur = UrlFetchApp.fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`, {
            method: 'get', headers: { Authorization: 'Bearer ' + tok }, muteHttpExceptions: true,
          });
          if (cur.getResponseCode() === 200) sha = JSON.parse(cur.getContentText()).sha;

          const body = { message, content: Utilities.base64Encode(Utilities.newBlob(content).getBytes()) };
          if (sha) body.sha = sha;
          const r = UrlFetchApp.fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`, {
            method: 'put',
            headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' },
            contentType: 'application/json',
            payload: JSON.stringify(body),
            muteHttpExceptions: true,
          });
          if (r.getResponseCode() < 200 || r.getResponseCode() >= 300) return jsonOut({ ok: false, error: 'HTTP ' + r.getResponseCode(), body: r.getContentText().slice(0, 300) });
          return jsonOut({ ok: true, action: 'ghWriteFile', sha_was: sha, html_url: JSON.parse(r.getContentText()).content && JSON.parse(r.getContentText()).content.html_url });
        } catch (e) { return jsonOut({ ok: false, error: e.message }); }
      }

      case 'controlPanelData': {
        // One-shot endpoint for the unified control panel — aggregates state.
        const out = { ok: true, action: 'controlPanelData', ts: new Date().toISOString() };
        try { out.send_disabled = (typeof _isSendDisabled === 'function') ? _isSendDisabled() : null; } catch (e) {}
        try { out.triggers = ScriptApp.getProjectTriggers().map(t => ({ handler: t.getHandlerFunction() })); } catch (e) {}
        try {
          const props = PropertiesService.getScriptProperties();
          const outboxId = props.getProperty('PC_OUTBOX_FILE_ID');
          if (outboxId) {
            const f = DriveApp.getFileById(outboxId);
            const ageMin = Math.floor((Date.now() - f.getLastUpdated().getTime()) / 60000);
            out.pc_age_min = ageMin;
            out.pc_online = ageMin < 5;
          }
        } catch (e) {}
        try {
          const inbox = yemotApi('GetIVR2Dir', { path: 'ivr2:/1' });
          const answers = yemotApi('GetIVR2Dir', { path: 'ivr2:/2' });
          const audio3 = yemotApi('GetIVR2Dir', { path: 'ivr2:/3' });
          out.ext_1_count = (inbox.files || []).filter(f => /\.wav$/.test(f.name) && !f.name.startsWith('M0000')).length;
          out.ext_2_count = (answers.files || []).filter(f => /^\d{3}\./.test(f.name)).length;
          out.ext_3_count = (audio3.files || []).filter(f => /^\d{3}\./.test(f.name)).length;
        } catch (e) {}
        try { if (typeof voiceLogRecent === 'function') out.recent = voiceLogRecent(20); } catch (e) {}
        try {
          const tok = PropertiesService.getScriptProperties().getProperty('GH_TOKEN');
          if (tok) {
            const r = UrlFetchApp.fetch('https://api.github.com/user/repos?per_page=30&sort=updated', {
              method: 'get', headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' },
              muteHttpExceptions: true,
            });
            if (r.getResponseCode() === 200) {
              out.repos = JSON.parse(r.getContentText()).map(x => ({
                name: x.name, full_name: x.full_name, updated: x.updated_at, html_url: x.html_url,
              }));
            }
          }
        } catch (e) {}
        return jsonOut(out);
      }

      case 'pcExecute': {
        // Direct PC command via Drive bridge (agent_pc.py reads inbox.json).
        // ?pc_action=open_app&pc_params={"path":"notepad.exe"} (URL-encoded)
        const pcAction = (e && e.parameter && e.parameter.pc_action) || '';
        if (!pcAction) return jsonOut({ ok: false, error: 'missing pc_action' });
        let pcParams = {};
        try {
          const raw = (e && e.parameter && e.parameter.pc_params) || '{}';
          pcParams = JSON.parse(raw);
        } catch (err) {
          return jsonOut({ ok: false, error: 'invalid pc_params: ' + err.message });
        }
        try {
          const cmdId = sendPcCommand(pcAction, pcParams);
          const result = waitForPcResult(cmdId, 30);
          if (!result) return jsonOut({ ok: false, error: 'timeout — PC off?', cmd_id: cmdId });
          return jsonOut({ ok: true, action: 'pcExecute', cmd_id: cmdId, result });
        } catch (err) {
          return jsonOut({ ok: false, error: String(err && err.message || err) });
        }
      }

      case 'phoneDashboard': {
        const lines = ['שלום. סטטוס המערכת.'];
        try {
          if (typeof _isSendDisabled === 'function') {
            lines.push(_isSendDisabled() ? 'שליחה אוטומטית מנוטרלת.' : 'שליחה אוטומטית פעילה.');
          }
        } catch (e) {}
        try {
          const props = PropertiesService.getScriptProperties();
          const outboxId = props.getProperty('PC_OUTBOX_FILE_ID');
          if (outboxId) {
            const f = DriveApp.getFileById(outboxId);
            const ageMin = Math.floor((Date.now() - f.getLastUpdated().getTime()) / 60000);
            lines.push(ageMin < 5 ? 'המחשב מחובר.' :
              ageMin < 60 ? 'המחשב נראה לפני ' + ageMin + ' דקות.' :
              'המחשב לא נראה זמן רב. אחרון לפני ' + Math.floor(ageMin/60) + ' שעות.');
          }
        } catch (e) {}
        try {
          const inbox = yemotApi('GetIVR2Dir', { path: 'ivr2:/1/2' });
          const answers = yemotApi('GetIVR2Dir', { path: 'ivr2:/1/1' });
          const wavCount = (inbox.files || []).filter(f => (f.name || '').endsWith('.wav') && !(f.name || '').startsWith('M0000')).length;
          const ansCount = (answers.files || []).filter(f => /^\d{3}\.(wav|tts)$/.test(f.name || '')).length;
          lines.push('בקו יש ' + wavCount + ' הקלטות ו ' + ansCount + ' תשובות.');
        } catch (e) {}
        try {
          if (typeof voiceLogRecent === 'function') {
            const recent = voiceLogRecent(3);
            if (recent.length > 0) {
              lines.push('הפעולה האחרונה.');
              const r = recent[0];
              if (r.transcript) lines.push('שאלת: ' + String(r.transcript).slice(0, 100));
              if (r.answer) lines.push('עניתי: ' + String(r.answer).slice(0, 150));
            }
          }
        } catch (e) {}
        const txt = lines.join(' ').replace(/[&=]/g, ' ').replace(/\s+/g, ' ').slice(0, 800);
        return ContentService.createTextOutput('id_list_message=t-' + txt + '&hangup=yes')
          .setMimeType(ContentService.MimeType.TEXT);
      }

      // case 'yemotVoice' moved below (line ~3621) — uses Gemini audio handler.

      case 'yemotVoiceLoop': {
        // Multi-turn live conversation — ext 8. Each turn keeps context by ApiCallId.
        // Returns hangup=no + go_to_folder=8 so the call loops until the user hangs up.
        const p = (e && e.parameter) || {};
        const callId = p.ApiCallId || 'unknown';
        const phone  = p.ApiPhone  || '';
        const q      = (p.q || p.user_query || '').trim();
        if (!q) {
          const prompt = 'שאל אותי משהו, אענה מיד.';
          return ContentService.createTextOutput('id_list_message=t-' + prompt + '&hangup=no&go_to_folder=8')
            .setMimeType(ContentService.MimeType.TEXT);
        }

        // Load session history (keyed by callId, stored in ScriptProperties)
        const props = PropertiesService.getScriptProperties();
        let history = [];
        try {
          const raw = props.getProperty('VOICE_SESSION_' + callId);
          if (raw) history = JSON.parse(raw);
        } catch (e2) { history = []; }

        // Build messages array with history
        const sys = (
          'אתה הסוכן הקולי של יוסף שניידר, מזכיר ישיבת בית התלמוד. ' +
          'זו שיחה טלפון חיה בזמן אמת. ' +
          'ענה בעברית תקנית, קצרה מאוד — שני משפטים מקסימום, ' +
          'בלי בולטים, בלי אימוג\'ים, בלי לחזור על השאלה. אם זו פקודה — אשר ביצוע.'
        );

        // Build full message with history
        let fullQ = q;
        if (history.length > 0) {
          const hist = history.slice(-6).map(h => h.role + ': ' + h.content).join('\n');
          fullQ = 'השיחה עד כה:\n' + hist + '\nיוסף: ' + q;
        }

        let ans = '';
        try {
          ans = (typeof llmCall === 'function')
            ? llmCall(sys, fullQ, { temperature: 0.4, maxTokens: 250 })
            : '';
        } catch (err2) { ans = ''; }
        ans = (ans || '').trim() || 'מצטער, נסה שוב בעוד רגע.';

        // Save updated history (keep last 8 turns)
        history.push({ role: 'יוסף', content: q });
        history.push({ role: 'סוכן', content: ans });
        if (history.length > 16) history = history.slice(-16);
        try { props.setProperty('VOICE_SESSION_' + callId, JSON.stringify(history)); } catch (e3) {}

        try {
          if (typeof logVoiceActivity === 'function') {
            logVoiceActivity({ source: 'yemot_ext8_loop', extension: '8', caller_phone: phone,
              transcript: q, transcript_via: 'yemot_voice', answer: ans, answer_via: 'llmCall',
              notes: 'callId=' + callId + ' turn=' + Math.floor(history.length / 2) });
          }
        } catch (logErr) {}

        const safe8 = ans.replace(/[&=]/g, ' ').replace(/\s+/g, ' ').slice(0, 500);
        return ContentService.createTextOutput('id_list_message=t-' + safe8 + '&hangup=no&go_to_folder=8')
          .setMimeType(ContentService.MimeType.TEXT);
      }

      case 'syncLineStructure': return jsonOut(syncLineStructure());
      case 'syncLineSettings':  return jsonOut(syncLineSettings());
      case 'lineSheetUrl':      return jsonOut({ ok: true, url: getLineSheetUrl() });
      case 'logTranscript':     return jsonOut(logTranscript((e && e.parameter) || {}));
      case 'logAnswer':         return jsonOut(logAnswer(Object.assign({}, (e && e.parameter) || {}, { push: !!((e && e.parameter && e.parameter.push)) })));
      case 'processPushQueue':  return jsonOut(processPushQueue());

      case 'yemotChatHold': {
        // /11 endpoint — Yemot calls this in a loop while /8 recording is
        // processed. The Python auto_answer agent calls setChatAnswer (below)
        // once the answer is uploaded to /2. Until then, this returns hold
        // music + go_to_folder=11 (loop). When ready, returns the answer
        // file path + go_to_folder=8 (next round).
        const p = (e && e.parameter) || {};
        const callId = p.ApiCallId || p.ApiCallID || '';
        const phone  = p.ApiPhone  || '';
        const key = 'CHAT_ANS_' + (callId || phone || 'unknown');
        const props = PropertiesService.getScriptProperties();
        const ans = props.getProperty(key);
        if (ans) {
          // Found answer — clear the slot, play it, return to /8 for next round.
          try { props.deleteProperty(key); } catch (e1) {}
          // ans is the Yemot file path like 'ivr2:/2/050.wav' or a t-text payload
          let payload = ans;
          if (!payload.startsWith('t-') && !payload.startsWith('f-')) {
            payload = 'f-' + payload;
          }
          return ContentService.createTextOutput('id_list_message=' + payload + '&go_to_folder=/8')
            .setMimeType(ContentService.MimeType.TEXT);
        }
        // No answer yet — play a 3s hold token and loop back to /11.
        // 't-' prefix means TTS the literal text; we ask Yemot to say a short
        // sound so the loop has minimum gap. Yosef hears a quiet beat between iterations.
        return ContentService.createTextOutput('id_list_message=t-המתן&go_to_folder=/11')
          .setMimeType(ContentService.MimeType.TEXT);
      }

      case 'setChatAnswer': {
        // Called by local Python (auto_answer_ext6_2) once it has uploaded the
        // answer audio to /2. Payload: callId (or phone) + path (e.g. ivr2:/2/050.wav)
        const p = (e && e.parameter) || {};
        const callId = p.ApiCallId || p.ApiCallID || '';
        const phone  = p.ApiPhone  || '';
        const path   = p.path || '';
        const key = 'CHAT_ANS_' + (callId || phone || 'unknown');
        if (!path) return jsonOut({ ok: false, error: 'missing path' });
        try {
          PropertiesService.getScriptProperties().setProperty(key, path);
          return jsonOut({ ok: true, key: key });
        } catch (err) {
          return jsonOut({ ok: false, error: String(err) });
        }
      }

      case 'voiceLogRecent': {
        const limit = parseInt((e && e.parameter && e.parameter.limit) || '50', 10);
        return jsonOut({ ok: true, action: 'voiceLogRecent', rows: voiceLogRecent(limit), sheetUrl: getVoiceLogUrl() });
      }

      case 'dashboardData': {
        // Aggregate everything the GitHub Pages dashboard needs in one call:
        //   - PC heartbeat (was the agent_pc.py recently writing to Drive?)
        //   - Trigger inventory (is processYemotInbox alive?)
        //   - Recent voice activity (last 30 rows)
        //   - SafeSend kill-switch state
        //   - Yemot quick health (extension count + last recording timestamp)
        const out = { ok: true, action: 'dashboardData', timestamp: new Date().toISOString() };
        try { out.send_disabled = _isSendDisabled(); } catch (e) { out.send_disabled_err = e.message; }
        try {
          const triggers = ScriptApp.getProjectTriggers().map(t => ({ handler: t.getHandlerFunction(), event: t.getEventType().toString() }));
          out.triggers = triggers;
          out.trigger_processYemotInbox = !!triggers.find(t => t.handler === 'processYemotInbox');
        } catch (e) { out.triggers_err = e.message; }
        try { out.recent = voiceLogRecent(30); } catch (e) { out.recent_err = e.message; }
        try {
          // PC heartbeat: read agent_pc_outbox.json's modifiedTime
          const props = PropertiesService.getScriptProperties();
          const outboxId = props.getProperty('PC_OUTBOX_FILE_ID');
          if (outboxId) {
            const f = DriveApp.getFileById(outboxId);
            const last = f.getLastUpdated();
            out.pc_last_seen = last ? last.toISOString() : null;
            out.pc_online_recent = last && (Date.now() - last.getTime() < 5 * 60 * 1000); // within 5 min
          } else {
            out.pc_outbox_missing = true;
          }
        } catch (e) { out.pc_err = e.message; }
        try {
          const dir = yemotApi('GetIVR2Dir', { path: 'ivr2:/1/2' });
          const wavs = (dir.files || []).filter(f => (f.name || '').endsWith('.wav') && !(f.name || '').startsWith('M'));
          out.yemot_inbox_count = wavs.length;
          out.yemot_last_recording = wavs.length ? wavs[wavs.length - 1].name : null;
        } catch (e) { out.yemot_err = e.message; }
        try {
          const dir2 = yemotApi('GetIVR2Dir', { path: 'ivr2:/1/1' });
          const answers = (dir2.files || []).filter(f => /^\d{3}\.(mp3|tts)$/.test(f.name || ''));
          out.yemot_answer_count = answers.length;
        } catch (e) {}
        return jsonOut(out);
      }

      case 'voiceLogUrl': {
        return jsonOut({ ok: true, action: 'voiceLogUrl', url: getVoiceLogUrl() });
      }

      case 'lastConversations': {
        const n = parseInt(params.n || '20', 10);
        const ss = getMemorySheet();
        const sh = ss.getSheetByName(MEM_SHEETS.CONVERSATIONS);
        const data = sh.getDataRange().getValues();
        const rows = data.slice(Math.max(1, data.length - n)).map(r => ({
          thread_id: r[0], sender: r[1], action: r[2], summary: r[3], date: r[4],
        }));
        return jsonOut({ ok: true, count: rows.length, conversations: rows });
      }

      case 'recentSent': {
        // Return the body of the most recent agent-sent emails so the operator
        // can inspect for encoding/prefix bugs (e.g. "???" at the start).
        const n = parseInt(params.n || '5', 10);
        const userEmail = getUserPrimaryEmail();
        const threads = GmailApp.search('in:sent newer_than:1d', 0, n);
        const out = [];
        threads.forEach(t => {
          const msgs = t.getMessages();
          // pick the most recent message FROM the user (agent sends as user)
          for (let i = msgs.length - 1; i >= 0; i--) {
            const m = msgs[i];
            if (extractEmail(m.getFrom()) === userEmail.toLowerCase()) {
              const body = m.getPlainBody() || '';
              const html = m.getBody() || '';
              // First 16 chars as hex codepoints to detect invisible chars
              const head = body.substring(0, 30);
              const headCodes = [];
              for (let k = 0; k < head.length; k++) {
                headCodes.push('U+' + head.charCodeAt(k).toString(16).padStart(4, '0'));
              }
              out.push({
                thread_id: t.getId(),
                date: m.getDate().toISOString(),
                to: m.getTo(),
                subject: m.getSubject(),
                body_first_120: body.substring(0, 120),
                body_first_30_hex: headCodes.join(' '),
                html_first_300: html.substring(0, 300),
                body_length: body.length,
              });
              break;
            }
          }
        });
        return jsonOut({ ok: true, count: out.length, sent: out });
      }

      case 'getProperties': {
        const props = PropertiesService.getScriptProperties().getProperties();
        // Round 5 fix: keys whose name suggests a secret are returned as
        // present/absent only — even the prefix could identify the token.
        // Long values are reduced to length+presence (was leaking 12 chars).
        const SECRET_KEY_PATTERNS = /(token|password|secret|key|api|auth|access|refresh|pat)/i;
        const safe = {};
        Object.keys(props).forEach(k => {
          const v = props[k] || '';
          if (SECRET_KEY_PATTERNS.test(k)) {
            safe[k] = v ? '<set:' + v.length + 'b>' : '<unset>';
          } else if (v.length > 80) {
            safe[k] = '<long:' + v.length + 'b>';
          } else {
            safe[k] = v;
          }
        });
        return jsonOut({ ok: true, properties: safe });
      }

      case 'setProperty': {
        // Round 5 fix: allowlist of writable keys. Without this, a stolen
        // webhook token could rewrite CLAUDE_ACCESS_TOKEN, GH_TOKEN, the
        // Yemot creds, etc. — full takeover. Only operational toggles
        // and a small set of safe keys may be set via the webhook now.
        const SETTABLE_KEYS = new Set([
          'USER_PHONE',
          'LAST_REVIEW_AT',
          'LAST_BULK_MOVE',
          'LAST_TRIGGER_HEAL',
          'WATCHDOG_LAST_HASH',
          'WATCHDOG_LAST_TS',
          'AGENT_ROOT_FOLDER_ID',
          'MEMORY_SHEET_ID',
          'PC_INBOX_FILE_ID',
          'PC_OUTBOX_FILE_ID',
          'YEMOT_TOKEN',
          'YEMOT_PAUSE_UNTIL',
        ]);
        const k = params.key || params.k;
        const v = params.value !== undefined ? params.value : params.v;
        if (!k) return jsonOut({ ok: false, error: 'missing key' }, 400);
        if (!SETTABLE_KEYS.has(k)) {
          return jsonOut({ ok: false, error: 'key not in allowlist', allowed: Array.from(SETTABLE_KEYS) }, 403);
        }
        PropertiesService.getScriptProperties().setProperty(k, v || '');
        return jsonOut({ ok: true, set: k });
      }

      case 'testAcknowledge': {
        // Self-test: invoke handleAcknowledgeAndDefer on the most recent
        // inbox thread that is not from the user himself. Sends a real
        // acknowledgment reply on that thread and a notification email.
        const userEmail = getUserPrimaryEmail();
        const threads = GmailApp.search('in:inbox -from:' + userEmail + ' newer_than:7d', 0, 5);
        if (!threads.length) return jsonOut({ ok: false, error: 'no third-party inbox threads found' });
        const t = threads[0];
        const m = t.getMessages()[t.getMessages().length - 1];
        const senderAddr = extractEmail(m.getFrom());
        const r = handleAcknowledgeAndDefer(t, m, senderAddr, '',
          'בדיקת מערכת — הופעלה ידנית דרך webhook testAcknowledge.');
        return jsonOut({ ok: true, action: 'testAcknowledge', target: { sender: senderAddr, subject: m.getSubject(), thread_id: t.getId() }, result: r });
      }

      case 'testYemot': {
        // Self-test: invoke Yemot.uploadUrgentMessage with a sample text.
        // Round 5 fix: cap input length so the webhook can't be used to
        // flood Yemot's TTS endpoint with massive payloads.
        const sample = (params.text || 'בדיקה: מייל דחוף התקבל מבדיקת המערכת. אין צורך בפעולה.')
          .substring(0, 2000);
        const res = Yemot.uploadUrgentMessage(sample, { sender: 'test@local', subject: 'בדיקת Yemot' });
        return jsonOut({ ok: true, action: 'testYemot', result: res });
      }

      case 'setupYemotLog': {
        // One-shot setup: configure ext 9 as action log + drop a sample entry.
        const r1 = Yemot.ensureActionLogExtension();
        const r2 = Yemot.logAction('site_modify',
          'הוקמה שלוחת יומן פעולות הסוכן בשלוחה תשע. כל פעולה של הסוכן תועלה לכאן אוטומטית.');
        return jsonOut({ ok: true, action: 'setupYemotLog', ini_result: r1, sample_log: r2 });
      }

      case 'cleanupYemotLog': {
        const keep = parseInt(params.keep || '100', 10);
        const r = Yemot.cleanupActionLog(keep);
        return jsonOut({ ok: true, action: 'cleanupYemotLog', result: r });
      }

      case 'logActionTest': {
        const t = params.actionType || 'site_modify';
        const s = params.summary || 'בדיקת מערכת — הועלתה רשומת יומן ידנית.';
        const r = Yemot.logAction(t, s);
        return jsonOut({ ok: true, action: 'logActionTest', result: r });
      }

      case 'yemotLogin': {
        // Direct login probe — uses yemotLoginVerbose() so we get the HTTP
        // status, parse error, or partial raw body for debugging.
        try {
          const r = (typeof yemotLoginVerbose === 'function') ? yemotLoginVerbose() : { token: yemotLogin(), error: 'no verbose helper' };
          if (r.token) {
            return jsonOut({ ok: true, action: 'yemotLogin', token: r.token, length: r.token.length, code: r.code });
          }
          return jsonOut({ ok: false, action: 'yemotLogin', code: r.code, error: r.error, raw: r.raw }, 500);
        } catch (e) {
          return jsonOut({ ok: false, action: 'yemotLogin', error: e.message, stack: String(e.stack || '').substring(0, 800) }, 500);
        }
      }

      case 'yemotHealth': {
        // Round 6 (2026-05-03): expose Yemot health (login + units) so the
        // operator can quickly tell whether Yemot is reachable and whether
        // the account has credits for outbound calls.
        try {
          const session = yemotApi('GetSession', null);
          const cust = yemotApi('GetCustomerData', null);
          return jsonOut({
            ok: !!(session && session.responseStatus === 'OK'),
            action: 'yemotHealth',
            session_ok: !!(session && session.responseStatus === 'OK'),
            units: cust ? cust.units : null,
            sms_units: cust ? cust.smsUnits : null,
            email: cust ? cust.email : null,
            api_version: cust ? cust.yAfastVersion : null,
          });
        } catch (e) {
          return jsonOut({ ok: false, action: 'yemotHealth', error: e.message }, 500);
        }
      }

      case 'recentInbox': {
        // Returns last N inbox emails as JSON for ext 5 (line voice readout).
        const limit = parseInt(params.limit || '5', 10);
        try {
          const threads = cachedSearch('in:inbox -from:me', limit);
          const out = threads.map(t => {
            // Use thin metadata when available
            if (t._thin) {
              const sender = (t._data.from || '').split('<')[0].replace(/"/g,'').trim() || t._data.from;
              return {
                from: sender,
                subject: t._data.subject || '(ללא נושא)',
                snippet: (t._data.snippet || '').substring(0, 150).replace(/[\r\n]+/g,' '),
                date: t._data.date,
              };
            }
            const msgs = t.getMessages();
            const m = msgs[msgs.length - 1];
            const sender = m.getFrom().split('<')[0].replace(/"/g,'').trim() || m.getFrom();
            return {
              from: sender,
              subject: m.getSubject() || '(ללא נושא)',
              snippet: (m.getPlainBody() || m.getBody() || '').substring(0, 150).replace(/[\r\n]+/g,' '),
              date: m.getDate().toISOString(),
            };
          });
          return jsonOut({ ok: true, action: 'recentInbox', count: out.length, threads: out, cached: threads[0]?._thin });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'fetchNews': {
        // Proxy fetcher for Hebrew news RSS — agent local IP is behind NetFree
        // which blocks news sites; Apps Script has uncensored egress.
        const sources = [
          { name: 'kipa', url: 'https://www.kipa.co.il/rss/news.xml' },
          { name: 'srugim', url: 'https://www.srugim.co.il/feed' },
          { name: 'inn', url: 'https://www.inn.co.il/Rss.aspx?act=14' },
          { name: 'kikar', url: 'https://www.kikar.co.il/feed' },
          { name: 'ynet', url: 'https://www.ynet.co.il/Integration/StoryRss2.xml' },
        ];
        const out = [];
        for (const s of sources) {
          try {
            const resp = UrlFetchApp.fetch(s.url, {
              muteHttpExceptions: true,
              followRedirects: true,
              headers: { 'User-Agent': 'Mozilla/5.0' },
              validateHttpsCertificates: false,
            });
            if (resp.getResponseCode() !== 200) continue;
            const xml = resp.getContentText();
            const titles = (xml.match(/<title>(?:<!\[CDATA\[)?([^<]+?)(?:\]\]>)?<\/title>/g) || [])
              .map(t => t.replace(/<[^>]+>/g, '').replace(/<!\[CDATA\[|\]\]>/g, '').trim())
              .filter(t => t.length > 10 && !/rss|^\s*$/i.test(t));
            if (titles.length) {
              out.push({ source: s.name, titles: titles.slice(1, 6) });
              if (out.length >= 3) break; // 3 sources is enough
            }
          } catch (err) { /* try next */ }
        }
        return jsonOut({ ok: true, action: 'fetchNews', sources: out, count: out.length });
      }

      case 'calendarToday': {
        // Today's calendar events for Yosef
        try {
          const cal = CalendarApp.getDefaultCalendar();
          const today = new Date();
          today.setHours(0,0,0,0);
          const tomorrow = new Date(today.getTime() + 24*60*60*1000);
          const events = cal.getEvents(today, tomorrow);
          const out = events.map(e => ({
            time: Utilities.formatDate(e.getStartTime(), 'Asia/Jerusalem', 'HH:mm'),
            title: e.getTitle(),
            location: e.getLocation() || '',
          }));
          return jsonOut({ ok: true, action: 'calendarToday', count: out.length, events: out });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'cheder_createSheet': {
        // Create the cheder Google Sheet on behalf of user (since Sheets API is disabled in OAuth project)
        try {
          const SHEET_TITLE = _chederSheetTitle(params);
          const propKey = _chederSheetIdProp(params);
          // Check if already exists
          const props = PropertiesService.getScriptProperties();
          let id = props.getProperty(propKey);
          if (id) {
            try {
              const ss = SpreadsheetApp.openById(id);
              return jsonOut({ ok: true, action: 'cheder_createSheet', existed: true, id, url: ss.getUrl() });
            } catch (e) { id = null; }
          }
          const ss = SpreadsheetApp.create(SHEET_TITLE);
          props.setProperty(propKey, ss.getId());
          // Setup tabs
          const TABS = {
            'משתמשים': ['שם משתמש', 'סיסמה', 'תפקיד', 'הרשאות', 'תאריך_הוספה'],
            'תלמידים': ['מזהה', 'שם פרטי', 'שם משפחה', 'גיל', 'מחזור', 'שם אם', 'טלפון אם', 'שם אב', 'טלפון אב', 'כתובת', 'הערות'],
            'מעקב_התנהגות': ['תאריך', 'תלמיד_מזהה', 'שם תלמיד', 'קטגוריה', 'תיאור', 'דווח_עי', 'חומרה'],
            'קטגוריות': ['קטגוריה', 'תיאור'],
          };
          Object.keys(TABS).forEach(name => {
            let sh = ss.getSheetByName(name) || ss.insertSheet(name);
            sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight('bold');
            sh.setFrozenRows(1);
          });
          const def = ss.getSheetByName('Sheet1');
          if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
          // Seed
          ss.getSheetByName('משתמשים').appendRow(['admin', '6742', 'מנהל', 'all', new Date()]);
          const cats = [
            ['התנהגות', 'אירועי התנהגות בכיתה'],
            ['דיבור עם הורים', 'תיעוד שיחות עם הורים'],
            ['אסיפת הורים', 'נושאים שעלו באסיפה'],
            ['מוגנות', 'נושאי מוגנות'],
            ['חינוך', 'נושאי חינוך אישי'],
            ['חברה', 'יחסי חברים בכיתה'],
            ['לימודים', 'הישגים לימודיים'],
            ['בריאות', 'נושאי בריאות'],
          ];
          const catSh = ss.getSheetByName('קטגוריות');
          cats.forEach(c => catSh.appendRow(c));
          return jsonOut({ ok: true, action: 'cheder_createSheet', id: ss.getId(), url: ss.getUrl() });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'cheder_ensureSchema': {
        // Idempotently ensure tab+column schema for classes and student status
        const lock = LockService.getScriptLock();
        try { lock.waitLock(15000); } catch (e) { return jsonOut({ ok: false, error: 'lock timeout' }, 503); }
        try {
          const props = PropertiesService.getScriptProperties();
          const id = props.getProperty(_chederSheetIdProp(params));
          if (!id) return jsonOut({ ok: false, error: 'sheet not created yet' }, 404);
          const ss = SpreadsheetApp.openById(id);
          const changes = [];
          // Ensure סטטוס column in תלמידים
          const stuSheet = ss.getSheetByName('תלמידים');
          if (stuSheet) {
            const stuHeaders = stuSheet.getRange(1, 1, 1, stuSheet.getLastColumn()).getValues()[0];
            if (!stuHeaders.includes('סטטוס')) {
              const newCol = stuSheet.getLastColumn() + 1;
              stuSheet.getRange(1, newCol).setValue('סטטוס').setFontWeight('bold');
              const lastRow = stuSheet.getLastRow();
              if (lastRow > 1) {
                const vals = [];
                for (let i = 0; i < lastRow - 1; i++) vals.push(['פעיל']);
                stuSheet.getRange(2, newCol, vals.length, 1).setValues(vals);
              }
              changes.push('added סטטוס column to תלמידים');
            }
          }
          // Ensure כיתות tab with seed
          let classSheet = ss.getSheetByName('כיתות');
          if (!classSheet) {
            classSheet = ss.insertSheet('כיתות');
            classSheet.getRange(1, 1, 1, 2).setValues([['שם', 'סדר']]).setFontWeight('bold');
            classSheet.setFrozenRows(1);
            const seed = [['א',1],['ב',2],['ג',3],['ד',4],['ה',5],['ו',6],['ז',7],['ח',8]];
            classSheet.getRange(2, 1, seed.length, 2).setValues(seed);
            changes.push('created כיתות tab with seed');
          }
          // Add extra columns to תלמידים for rich data
          if (stuSheet) {
            const stuHeadersNow = stuSheet.getRange(1, 1, 1, stuSheet.getLastColumn()).getValues()[0];
            const extra = ['תאריך לידה', 'מספר זהות', 'תז אב', 'תז אם', 'טלפון בית', 'עיר', 'שכונה', 'אלרגיה', 'הערות רפואיות'];
            extra.forEach(col => {
              if (!stuHeadersNow.includes(col)) {
                const newCol = stuSheet.getLastColumn() + 1;
                stuSheet.getRange(1, newCol).setValue(col).setFontWeight('bold');
                stuHeadersNow.push(col);
                changes.push('added ' + col + ' column to תלמידים');
              }
            });
          }
          // Add 'סוג' to כדורים tab (medical: drug/allergy/sensitivity/...)
          const medSheet = ss.getSheetByName('כדורים');
          if (medSheet) {
            const medHeadersNow = medSheet.getRange(1, 1, 1, medSheet.getLastColumn()).getValues()[0];
            if (!medHeadersNow.includes('סוג')) {
              const newCol = medSheet.getLastColumn() + 1;
              medSheet.getRange(1, newCol).setValue('סוג').setFontWeight('bold');
              changes.push('added סוג column to כדורים');
            }
          }
          // Add extra columns to מעקב_התנהגות
          const behSheet = ss.getSheetByName('מעקב_התנהגות');
          if (behSheet) {
            const behHeadersNow = behSheet.getRange(1, 1, 1, behSheet.getLastColumn()).getValues()[0];
            const extraB = ['מזהה', 'פירוט', 'הערות', 'פרשה', 'תאריך_עברי', 'שיעור'];
            extraB.forEach(col => {
              if (!behHeadersNow.includes(col)) {
                const newCol = behSheet.getLastColumn() + 1;
                behSheet.getRange(1, newCol).setValue(col).setFontWeight('bold');
                behHeadersNow.push(col);
                changes.push('added ' + col + ' column to מעקב_התנהגות');
              }
            });
          }
          // Add extra columns to משתמשים for richer user profiles
          const usrSheet = ss.getSheetByName('משתמשים');
          if (usrSheet) {
            const uHeadersNow = usrSheet.getRange(1, 1, 1, usrSheet.getLastColumn()).getValues()[0];
            const extraU = ['תלמידים_מורשים', 'קטגוריות_מורשות', 'כיתות_מורשות', 'שם מלא', 'אימייל', 'טלפון', 'הערות_משתמש'];
            extraU.forEach(col => {
              if (!uHeadersNow.includes(col)) {
                const newCol = usrSheet.getLastColumn() + 1;
                usrSheet.getRange(1, newCol).setValue(col).setFontWeight('bold');
                uHeadersNow.push(col);
                changes.push('added ' + col + ' column to משתמשים');
              }
            });
          }
          // Add תמונה column to תלמידים
          if (stuSheet) {
            const sHeadersNow = stuSheet.getRange(1, 1, 1, stuSheet.getLastColumn()).getValues()[0];
            if (!sHeadersNow.includes('תמונה')) {
              const newCol = stuSheet.getLastColumn() + 1;
              stuSheet.getRange(1, newCol).setValue('תמונה').setFontWeight('bold');
              changes.push('added תמונה column to תלמידים');
            }
          }
          // Add רב column to אסיפות (records who wrote the meeting report)
          const meetSheet = ss.getSheetByName('אסיפות');
          if (meetSheet) {
            const mHeadersNow = meetSheet.getRange(1, 1, 1, meetSheet.getLastColumn()).getValues()[0];
            if (!mHeadersNow.includes('רב')) {
              const newCol = meetSheet.getLastColumn() + 1;
              meetSheet.getRange(1, newCol).setValue('רב').setFontWeight('bold');
              changes.push('added רב column to אסיפות');
            }
          }
          // Add extra columns to שיחות
          const convSheet = ss.getSheetByName('שיחות');
          if (convSheet) {
            const cHeadersNow = convSheet.getRange(1, 1, 1, convSheet.getLastColumn()).getValues()[0];
            const extraC = ['קטגוריה', 'תאריך_עברי', 'פרשה', 'אירוע_מקושר'];
            extraC.forEach(col => {
              if (!cHeadersNow.includes(col)) {
                const newCol = convSheet.getLastColumn() + 1;
                convSheet.getRange(1, newCol).setValue(col).setFontWeight('bold');
                cHeadersNow.push(col);
                changes.push('added ' + col + ' column to שיחות');
              }
            });
          }
          // Ensure new tabs for v2 modules
          const NEW_TABS = {
            'תפקוד': ['מזהה', 'תלמיד_מזהה', 'תקופה', 'קטגוריה', 'תת_קטגוריה', 'פרמטר', 'ציון', 'תאריך', 'הערות'],
            'מבחנים': ['מזהה', 'תלמיד_מזהה', 'סוג', 'פרשה', 'ציון', 'תאריך', 'הערות'],
            'כדורים': ['מזהה', 'תלמיד_מזהה', 'סוג', 'תרופה', 'מצב_כיום', 'שיחת_הורים', 'תאריך_עדכון', 'הערות'],
            'אסיפות': ['מזהה', 'תלמיד_מזהה', 'תאריך', 'תקופה', 'נושא', 'משתתפים', 'סיכום', 'הערות', 'רב'],
            'נוכחות': ['מזהה', 'תלמיד_מזהה', 'שם תלמיד', 'תאריך', 'סטטוס', 'מחזור', 'הערות'],
            'שיחות': ['מזהה', 'תלמיד_מזהה', 'תאריך', 'נושא', 'תוכן', 'רב', 'הערות', 'קטגוריה', 'תאריך_עברי', 'פרשה', 'אירוע_מקושר'],
            // 2026-05-21: behavior system tabs
            'משימות': ['מזהה', 'כותרת', 'תיאור', 'תלמיד_מזהה', 'תאריך_יעד', 'סטטוס', 'עדיפות', 'אחראי', 'תאריך_יצירה', 'תאריך_השלמה', 'אירוע_מזהה', 'פרויקט_מזהה'],
            'פרויקטים': ['מזהה', 'שם', 'תיאור', 'סטטוס', 'אחראי', 'תאריך_יצירה', 'תאריך_יעד', 'הערות'],
          };
          // Ensure new columns in מעקב_התנהגות for phone-line approval flow
          if (behSheet) {
            const behHeadersNow2 = behSheet.getRange(1, 1, 1, behSheet.getLastColumn()).getValues()[0];
            ['סטטוס_אישור', 'מקור', 'דווח_עי'].forEach(col => {
              if (!behHeadersNow2.includes(col)) {
                const newCol = behSheet.getLastColumn() + 1;
                behSheet.getRange(1, newCol).setValue(col).setFontWeight('bold');
                behHeadersNow2.push(col);
                changes.push('added ' + col + ' column to מעקב_התנהגות');
              }
            });
          }
          Object.keys(NEW_TABS).forEach(tn => {
            if (!ss.getSheetByName(tn)) {
              const newSh = ss.insertSheet(tn);
              newSh.getRange(1, 1, 1, NEW_TABS[tn].length).setValues([NEW_TABS[tn]]).setFontWeight('bold');
              newSh.setFrozenRows(1);
              changes.push('created ' + tn + ' tab');
            }
          });
          return jsonOut({ ok: true, changes });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        } finally {
          try { lock.releaseLock(); } catch(e){}
        }
      }

      case 'cheder_appendRow': {
        // Append row to cheder sheet
        try {
          const props = PropertiesService.getScriptProperties();
          const id = props.getProperty(_chederSheetIdProp(params));
          if (!id) return jsonOut({ ok: false, error: 'sheet not created yet' }, 404);
          const ss = SpreadsheetApp.openById(id);
          const tab = params.tab;
          const sh = ss.getSheetByName(tab);
          if (!sh) return jsonOut({ ok: false, error: 'tab not found: ' + tab }, 404);
          const rowJson = params.row;
          if (!rowJson) return jsonOut({ ok: false, error: 'no row' }, 400);
          const obj = JSON.parse(rowJson);
          const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
          const row = headers.map(h => obj[h] !== undefined ? obj[h] : '');
          sh.appendRow(row);
          return jsonOut({ ok: true, rowCount: sh.getLastRow() });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'cheder_bulkAppend': {
        // Bulk-append many rows in one call. Body: { tab, rows: [obj,...] } as base64 in params.body_b64
        try {
          const props = PropertiesService.getScriptProperties();
          const id = props.getProperty(_chederSheetIdProp(params));
          if (!id) return jsonOut({ ok: false, error: 'sheet not created yet' }, 404);
          const ss = SpreadsheetApp.openById(id);
          let payload;
          if (params.body_b64) {
            payload = JSON.parse(Utilities.newBlob(Utilities.base64Decode(params.body_b64)).getDataAsString('UTF-8'));
          } else {
            payload = JSON.parse(params.payload || '{}');
          }
          const tab = payload.tab;
          const rows = payload.rows || [];
          const replace = !!payload.replace;
          const sh = ss.getSheetByName(tab);
          if (!sh) return jsonOut({ ok: false, error: 'tab not found: ' + tab }, 404);
          const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
          if (replace && sh.getLastRow() > 1) {
            sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
          }
          if (!rows.length) return jsonOut({ ok: true, written: 0 });
          const values = rows.map(obj => headers.map(h => obj[h] !== undefined ? obj[h] : ''));
          const startRow = sh.getLastRow() + 1;
          sh.getRange(startRow, 1, values.length, headers.length).setValues(values);
          return jsonOut({ ok: true, written: values.length, rowCount: sh.getLastRow() });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'fetchEmailAttachments': {
        // Fetch attachments from a specific email message and return as base64 array
        try {
          const messageId = params.messageId;
          if (!messageId) return jsonOut({ ok: false, error: 'messageId required' }, 400);
          const msg = GmailApp.getMessageById(messageId);
          if (!msg) return jsonOut({ ok: false, error: 'message not found' }, 404);
          const attachments = msg.getAttachments();
          const out = attachments.map(a => ({
            name: a.getName(),
            type: a.getContentType(),
            size: a.getSize(),
            data: Utilities.base64Encode(a.getBytes()),
          }));
          return jsonOut({ ok: true, count: out.length, attachments: out });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'saveReceiptPDF': {
        // Save a base64 PDF to user's Drive folder "חשבוניות למכינה"
        try {
          const name = params.name || ('receipt_' + Date.now() + '.pdf');
          const dataB64 = params.data;
          if (!dataB64) return jsonOut({ ok: false, error: 'data required' }, 400);
          const blob = Utilities.newBlob(Utilities.base64Decode(dataB64), 'application/pdf', name);
          const folder = DriveApp.getFoldersByName('חשבוניות למכינה').hasNext()
            ? DriveApp.getFoldersByName('חשבוניות למכינה').next()
            : DriveApp.createFolder('חשבוניות למכינה');
          const file = folder.createFile(blob);
          return jsonOut({ ok: true, file_id: file.getId(), url: file.getUrl() });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'searchReceipts': {
        // Find Rami Levi / receipts emails for processing
        try {
          const q = params.q || 'subject:(חשבונית OR קבלה OR רמי לוי OR מעוצמתינו OR קרן אור)';
          const threads = cachedSearch(q, 20);
          const out = threads.map(t => {
            if (t._thin) {
              return { id: t._data.id, subject: t._data.subject, from: t._data.from, date: t._data.date };
            }
            const m = t.getMessages()[0];
            return { id: t.getId(), subject: m.getSubject(), from: m.getFrom(), date: m.getDate().toISOString() };
          });
          return jsonOut({ ok: true, count: out.length, threads: out });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'sendEmailWithAttachments': {
        // Send email with file attachments (privacy-friendly, no public Drive link).
        // Optional: replyToThreadId — if provided, sends as a reply inside that
        // thread (preserves In-Reply-To/References, keeps the conversation
        // grouped in the recipient's inbox).
        try {
          const to = params.to;
          const subject = params.subject || '(no subject)';
          let body = params.body || '';
          if (params.bodyB64) body = Utilities.newBlob(Utilities.base64Decode(params.bodyB64)).getDataAsString('UTF-8');
          const attsRaw = params.attachmentsB64 || '';
          if (!attsRaw) return jsonOut({ ok: false, error: 'no attachments' }, 400);
          const attsJson = Utilities.newBlob(Utilities.base64Decode(attsRaw)).getDataAsString('UTF-8');
          const atts = JSON.parse(attsJson);
          const attachments = atts.map(a => Utilities.newBlob(Utilities.base64Decode(a.data), a.mime || 'application/octet-stream', a.name));

          const replyThreadId = params.replyToThreadId || '';
          if (replyThreadId) {
            // GmailThread.reply preserves threading. We use replyAll(body, opts)
            // with subject override to keep the "Re:" prefix predictable.
            const thread = GmailApp.getThreadById(replyThreadId);
            if (!thread) return jsonOut({ ok: false, error: 'thread not found: ' + replyThreadId }, 404);
            const opts = { attachments, htmlBody: body ? ('<div dir="rtl" style="text-align:right;white-space:pre-wrap">' + body.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>') : undefined };
            // Honor an explicit `to` override; default to the original sender.
            if (params.to) opts.to = params.to;
            if (params.subject) opts.subject = params.subject;
            thread.reply(body || ' ', opts);
            return jsonOut({ ok: true, action: 'sendEmailWithAttachments', mode: 'reply', threadId: replyThreadId, count: attachments.length });
          }

          GmailApp.sendEmail(to, subject, body, { attachments });
          return jsonOut({ ok: true, action: 'sendEmailWithAttachments', to, count: attachments.length });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'html_to_pdf': {
        // Convert HTML to PDF via Drive, return shareable URL
        try {
          const html = Utilities.newBlob(Utilities.base64Decode(params.html_b64)).getDataAsString('UTF-8');
          const name = params.name || 'document.pdf';
          const blob = Utilities.newBlob(html, 'text/html', name + '.html');
          const tmp = DriveApp.createFile(blob);
          const pdf = tmp.getAs('application/pdf').setName(name);
          tmp.setTrashed(true);
          // Save to Alon folder
          const folder = DriveApp.getFoldersByName('עלוני פרשת שבוע').hasNext()
            ? DriveApp.getFoldersByName('עלוני פרשת שבוע').next()
            : DriveApp.createFolder('עלוני פרשת שבוע');
          const f = folder.createFile(pdf);
          f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          return jsonOut({ ok: true, url: f.getUrl(), id: f.getId() });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'cheder_addIdColumn': {
        // One-time fix: add מזהה column to a tab if missing
        try {
          const props = PropertiesService.getScriptProperties();
          const id = props.getProperty(_chederSheetIdProp(params));
          const ss = SpreadsheetApp.openById(id);
          const sh = ss.getSheetByName(params.tab);
          const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
          if (headers.includes('מזהה')) return jsonOut({ ok: true, already: true });
          // Insert מזהה as first column
          sh.insertColumnBefore(1);
          sh.getRange(1, 1).setValue('מזהה').setFontWeight('bold');
          // Backfill IDs to existing rows
          const lastRow = sh.getLastRow();
          if (lastRow > 1) {
            const ids = [];
            for (let i = 0; i < lastRow - 1; i++) ids.push([i + 1]);
            sh.getRange(2, 1, ids.length, 1).setValues(ids);
          }
          return jsonOut({ ok: true, added: true, rows: lastRow - 1 });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'parent_form_create_link': {
        // Admin issues a one-time signed link with a token
        try {
          const t = params.t || Utilities.getUuid().replace(/-/g,'').substring(0, 16);
          const props = PropertiesService.getScriptProperties();
          const validTokens = JSON.parse(props.getProperty('PARENT_FORM_TOKENS') || '{}');
          validTokens[t] = {
            created: Date.now(),
            createdAt: Date.now(),  // for forms-manager
            tpl: params.tpl || 'general',
            ref: params.ref || '',
            used: false,
            viewed: false,
            broadcast: params.broadcast === '1' || params.broadcast === true,
            studentName: params.student_name || '',
          };
          props.setProperty('PARENT_FORM_TOKENS', JSON.stringify(validTokens));
          return jsonOut({ ok: true, token: t });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'parent_form_submit': {
        // Comprehensive parent form: build PDF + email to user
        try {
          const tpl = params.tpl || 'general';
          const title = params.title || 'אישור הורים';
          const ref = params.ref || '';
          const sendTo = params.send_to || '6742853@gmail.com';
          const fields = JSON.parse(params.fields || '{}');
          const sigDataUrl = params.signature || '';
          const linkToken = params.lt || '';
          // Validate one-time token if provided
          if (linkToken) {
            const props = PropertiesService.getScriptProperties();
            const tokens = JSON.parse(props.getProperty('PARENT_FORM_TOKENS') || '{}');
            if (!tokens[linkToken]) {
              return jsonOut({ ok: false, error: 'קישור לא תקף' }, 403);
            }
            if (tokens[linkToken].used) {
              return jsonOut({ ok: false, error: 'הקישור כבר שומש' }, 403);
            }
            tokens[linkToken].used = true;
            tokens[linkToken].usedAt = Date.now();
            props.setProperty('PARENT_FORM_TOKENS', JSON.stringify(tokens));
          }
          if (!sigDataUrl.startsWith('data:image/png')) {
            return jsonOut({ ok: false, error: 'invalid signature' }, 400);
          }
          const today = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'dd/MM/yyyy');
          // Compact single-page PDF design
          let html = '<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>';
          html += '@page{size:A4;margin:10mm}';
          html += 'body{font-family:Arial,sans-serif;direction:rtl;color:#1f2937;padding:0;font-size:9pt;line-height:1.3}';
          html += 'h1{color:#0066cc;border-bottom:2px solid #0066cc;padding-bottom:4pt;font-size:16pt;margin:0 0 4pt}';
          html += 'h2{color:#0066cc;font-size:11pt;margin:8pt 0 4pt}';
          html += '.field{margin:0;padding:3pt 6pt;border-bottom:1px solid #f0f0f0;display:flex;gap:8pt;align-items:baseline}';
          html += '.label{font-weight:700;color:#666;font-size:8pt;min-width:90pt}';
          html += '.value{font-size:9pt;flex:1}';
          html += '.checked{color:#16a34a}.unchecked{color:#dc2626}';
          html += '.signature{margin-top:10pt;padding-top:6pt;border-top:1px solid #0066cc}';
          html += '.signature img{max-width:200pt;height:auto;border:1px solid #ccc;background:#fff;padding:2pt}';
          html += '.meta{color:#666;font-size:8pt;margin-bottom:6pt}';
          html += '</style></head><body>';
          html += '<h1>' + title + '</h1>';
          html += '<div class="meta">בית התלמוד · בית שמש · נחתם ב-' + today + (ref ? ' · ' + ref : '') + '</div>';
          for (const k in fields) {
            const v = fields[k];
            let display;
            if (typeof v === 'boolean') {
              display = v ? '<span class="checked">✓ אושר</span>' : '<span class="unchecked">✗ לא אושר</span>';
            } else {
              display = String(v || '—');
            }
            html += '<div class="field"><div class="label">' + k + '</div><div class="value">' + display + '</div></div>';
          }
          html += '<div class="signature"><h2>חתימה</h2>';
          html += '<img src="' + sigDataUrl + '"/>';
          html += '</div></body></html>';
          const tempBlob = Utilities.newBlob(html, 'text/html', 'form.html');
          const tempFile = DriveApp.createFile(tempBlob);
          const pdfBlob = tempFile.getAs('application/pdf').setName(title + '_' + (fields['שם התלמיד']||'') + '_' + today.replace(/\//g,'-') + '.pdf');
          tempFile.setTrashed(true);
          // Folder hierarchy: אישורי הורים / [title] / [ref or "כללי"] / file.pdf
          const ensureFolder = (parent, name) => {
            const it = parent.getFoldersByName(name);
            return it.hasNext() ? it.next() : parent.createFolder(name);
          };
          let folder = DriveApp.getFoldersByName('אישורי הורים').hasNext()
            ? DriveApp.getFoldersByName('אישורי הורים').next()
            : DriveApp.createFolder('אישורי הורים');
          folder = ensureFolder(folder, title);  // by form type (אישור טיול / אישור צילום etc)
          if (ref) folder = ensureFolder(folder, ref);  // by event ref (e.g. "טיול ל"ג בעומר תשפ"ו")
          const savedFile = folder.createFile(pdfBlob);
          // PRIVATE — only owner has access (no public link)
          // (default Drive permission is private)
          const recipients = sendTo.split(',').map(s => s.trim()).filter(Boolean);
          const parentEmail = (params.parent_email || '').trim();
          const subject = '[חתום] ' + title + ' — ' + (fields['שם התלמיד']||'');
          const bodyText = 'אישור חתום מצורף. סוג: ' + title + '. נחתם ב-' + today +
            (parentEmail ? '.\nנשלח על ידי: ' + parentEmail : '') +
            '.\n\nשמור ב-Drive (פרטי): ' + savedFile.getUrl();
          const opts = { attachments: [pdfBlob] };
          // 2026-05-21: replyTo=parent_email so when the school replies it goes back to the parent
          if (parentEmail) opts.replyTo = parentEmail;
          recipients.forEach(to => {
            GmailApp.sendEmail(to, subject, bodyText, opts);
          });
          return jsonOut({ ok: true, action: 'parent_form_submit', file_url: savedFile.getUrl(), recipients, folder: folder.getName() });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'parent_signature_submit': {
        // Receive parent signature from public form, save as PNG, email user
        try {
          const name = params.name || 'הורה';
          const ref = params.ref || '';
          const email = params.email || '';
          const sigDataUrl = params.signature || '';
          if (!sigDataUrl.startsWith('data:image/png')) {
            return jsonOut({ ok: false, error: 'invalid signature' }, 400);
          }
          const base64 = sigDataUrl.split(',')[1];
          const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/png',
            'signature_' + name.replace(/\s/g,'_') + '_' + Date.now() + '.png');
          // Save to Drive
          const folder = DriveApp.getFoldersByName('חתימות הורים').hasNext() ?
            DriveApp.getFoldersByName('חתימות הורים').next() :
            DriveApp.createFolder('חתימות הורים');
          const file = folder.createFile(blob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          // Email Yosef
          GmailApp.sendEmail('6742853@gmail.com',
            'חתימה התקבלה: ' + name + (ref ? ' (' + ref + ')' : ''),
            'חתימה התקבלה מ-' + name + '\n\nReference: ' + ref + '\nEmail: ' + email + '\n\nקישור לחתימה: ' + file.getUrl(),
            { attachments: [blob] });
          return jsonOut({ ok: true, action: 'parent_signature_submit', file_url: file.getUrl() });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'yemot_approveDraft': {
        // Called from ivr2:/4/1 — sends the first/newest pending draft
        try {
          const drafts = GmailApp.getDrafts();
          if (!drafts.length) {
            return jsonOut({ ok: false, error: 'no drafts' });
          }
          // Send the most recent draft
          const newest = drafts[drafts.length - 1];
          const msg = newest.send();
          return jsonOut({ ok: true, action: 'yemot_approveDraft', sent: msg.getId() });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'yemot_deleteDraft': {
        // Called from ivr2:/4/2 — deletes the first/newest pending draft
        try {
          const drafts = GmailApp.getDrafts();
          if (!drafts.length) {
            return jsonOut({ ok: false, error: 'no drafts' });
          }
          const newest = drafts[drafts.length - 1];
          newest.deleteDraft();
          return jsonOut({ ok: true, action: 'yemot_deleteDraft' });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'cheder_updateRow': {
        // Update a row by key/value match
        try {
          const props = PropertiesService.getScriptProperties();
          const id = props.getProperty(_chederSheetIdProp(params));
          if (!id) return jsonOut({ ok: false, error: 'sheet not created' }, 404);
          const ss = SpreadsheetApp.openById(id);
          const sh = ss.getSheetByName(params.tab);
          if (!sh) return jsonOut({ ok: false, error: 'tab not found' }, 404);
          const row = JSON.parse(params.row || '{}');
          const matchKey = params.matchKey || 'מזהה';
          const matchValue = params.matchValue;
          const data = sh.getDataRange().getValues();
          const headers = data[0];
          const keyIdx = headers.indexOf(matchKey);
          if (keyIdx < 0) return jsonOut({ ok: false, error: 'matchKey not in headers: ' + matchKey }, 400);
          for (let i = 1; i < data.length; i++) {
            if (String(data[i][keyIdx]) === String(matchValue)) {
              const newRow = headers.map((h, idx) => row[h] !== undefined ? row[h] : data[i][idx]);
              sh.getRange(i+1, 1, 1, headers.length).setValues([newRow]);
              return jsonOut({ ok: true, updated: i+1 });
            }
          }
          return jsonOut({ ok: false, error: 'row not found' }, 404);
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'cheder_deleteRow': {
        try {
          const props = PropertiesService.getScriptProperties();
          const id = props.getProperty(_chederSheetIdProp(params));
          if (!id) return jsonOut({ ok: false, error: 'sheet not created' }, 404);
          const ss = SpreadsheetApp.openById(id);
          const sh = ss.getSheetByName(params.tab);
          if (!sh) return jsonOut({ ok: false, error: 'tab not found' }, 404);
          const matchKey = params.matchKey || 'מזהה';
          const matchValue = params.matchValue;
          const data = sh.getDataRange().getValues();
          const headers = data[0];
          const keyIdx = headers.indexOf(matchKey);
          for (let i = data.length - 1; i >= 1; i--) {
            if (String(data[i][keyIdx]) === String(matchValue)) {
              sh.deleteRow(i+1);
              return jsonOut({ ok: true, deleted: i+1 });
            }
          }
          return jsonOut({ ok: false, error: 'row not found' }, 404);
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'cheder_listRows': {
        try {
          const props = PropertiesService.getScriptProperties();
          const id = props.getProperty(_chederSheetIdProp(params));
          if (!id) return jsonOut({ ok: false, error: 'sheet not created' }, 404);
          const ss = SpreadsheetApp.openById(id);
          const sh = ss.getSheetByName(params.tab);
          if (!sh) return jsonOut({ ok: false, error: 'tab not found' }, 404);
          const data = sh.getDataRange().getValues();
          if (data.length < 2) return jsonOut({ ok: true, rows: [] });
          const headers = data[0];
          const rows = data.slice(1).map(r => {
            const o = {};
            headers.forEach((h,i) => o[h] = r[i]);
            return o;
          });
          return jsonOut({ ok: true, rows });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'cheder_submitFeedback': {
        // Save user-submitted bug/feature request to "בקשות" tab + email admin
        try {
          const props = PropertiesService.getScriptProperties();
          const id = props.getProperty(_chederSheetIdProp(params));
          if (!id) return jsonOut({ ok: false, error: 'sheet not created' }, 404);
          const ss = SpreadsheetApp.openById(id);
          let sh = ss.getSheetByName('בקשות');
          if (!sh) {
            sh = ss.insertSheet('בקשות');
            sh.appendRow(['חותמת זמן','מזהה','שולח','אימייל שולח','סוג','דחיפות','כותרת','תיאור','סטטוס','מטפל','סיכום תיקון','עודכן בתאריך','דווח']);
            sh.setFrozenRows(1);
            sh.getRange(1,1,1,13).setFontWeight('bold').setBackground('#fff2cc');
          } else {
            // Self-heal: ensure 'דווח' column exists
            const head = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
            if (head.indexOf('דווח') < 0) {
              const c = sh.getLastColumn() + 1;
              sh.getRange(1, c).setValue('דווח').setFontWeight('bold');
            }
          }
          const id_seq = Utilities.formatDate(new Date(), 'GMT', 'yyyyMMddHHmmss');
          const ts = new Date();
          const sender = String(params.sender || '').trim();
          const senderEmail = String(params.senderEmail || '').trim();
          const kind = String(params.kind || 'באג').trim();           // באג / שדרוג / שאלה
          const urgency = String(params.urgency || 'רגיל').trim();    // רגיל / דחוף / קריטי
          const title = String(params.title || '').trim();
          const desc = String(params.desc || '').trim();
          if (!title || !desc) return jsonOut({ ok: false, error: 'title+desc required' }, 400);
          sh.appendRow([ts, id_seq, sender, senderEmail, kind, urgency, title, desc, 'פתוח', '', '', '']);
          // Notify admin (yosef) by email
          try {
            const inst = params.instance === 'bht' ? 'בית התלמוד' : 'חיידר מעלה עמוס';
            const subject = `[בקשת ${kind}] [${urgency}] ${inst}: ${title}`;
            const body =
              'בקשה חדשה מהאתר ' + inst + ':\n\n' +
              'שולח: ' + sender + ' (' + senderEmail + ')\n' +
              'סוג: ' + kind + '\n' +
              'דחיפות: ' + urgency + '\n' +
              'כותרת: ' + title + '\n\n' +
              'תיאור:\n' + desc + '\n\n' +
              '---\n' +
              'מזהה: ' + id_seq + '\n' +
              'נשמר ב-Sheet "בקשות"';
            GmailApp.sendEmail('6742853@gmail.com', subject, body);
          } catch (e) { /* non-fatal */ }
          return jsonOut({ ok: true, id: id_seq });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'cheder_resolveFeedback': {
        // Mark a feedback row as resolved + email the original requester
        try {
          const props = PropertiesService.getScriptProperties();
          const id = props.getProperty(_chederSheetIdProp(params));
          if (!id) return jsonOut({ ok: false, error: 'sheet not created' }, 404);
          const ss = SpreadsheetApp.openById(id);
          const sh = ss.getSheetByName('בקשות');
          if (!sh) return jsonOut({ ok: false, error: 'no בקשות tab' }, 404);
          const data = sh.getDataRange().getValues();
          const head = data[0];
          const idCol = head.indexOf('מזהה');
          for (let i = 1; i < data.length; i++) {
            if (String(data[i][idCol]) === String(params.feedbackId)) {
              sh.getRange(i+1, head.indexOf('סטטוס')+1).setValue(params.status || 'תוקן');
              sh.getRange(i+1, head.indexOf('מטפל')+1).setValue(params.handler || 'הסוכן');
              sh.getRange(i+1, head.indexOf('סיכום תיקון')+1).setValue(params.summary || '');
              sh.getRange(i+1, head.indexOf('עודכן בתאריך')+1).setValue(new Date());
              // Email the original requester
              try {
                const senderEmail = data[i][head.indexOf('אימייל שולח')];
                const title = data[i][head.indexOf('כותרת')];
                if (senderEmail) {
                  const subject = '[בוצע] ' + title;
                  const body =
                    'שלום,\n\nהבקשה שלך טופלה.\n\n' +
                    'הבקשה: ' + title + '\n' +
                    'מה תוקן:\n' + (params.summary || '(ללא פירוט)') + '\n\n' +
                    'אם משהו עוד לא עובד טוב - תכתוב שוב.\n\n' +
                    'יוסי';
                  GmailApp.sendEmail(senderEmail, subject, body);
                }
              } catch (e) { /* non-fatal */ }
              return jsonOut({ ok: true });
            }
          }
          return jsonOut({ ok: false, error: 'feedback id not found' }, 404);
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'gCall': {
        // Generic gCall passthrough — used by cheder GitHub Pages frontend
        // (no token check here — kept open for static frontend, sheet has its own auth)
        try {
          const fnName = params.fn;
          const args = params.args ? JSON.parse(params.args) : [];
          // Call into cheder if loaded — but cheder is a different project.
          // This is a stub; real cheder backend is at its own deployment.
          return jsonOut({ ok: false, error: 'gCall not supported here — use cheder backend directly' });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'fetchUrl': {
        // Generic Apps Script proxy fetch — for the agent to retrieve any URL
        // that NetFree blocks locally. Returns the raw body up to 100KB.
        const u = params.url;
        if (!u) return jsonOut({ ok: false, error: 'url_required' }, 400);
        try {
          const resp = UrlFetchApp.fetch(u, {
            muteHttpExceptions: true,
            followRedirects: true,
            headers: { 'User-Agent': params.ua || 'Mozilla/5.0' },
            validateHttpsCertificates: false,
          });
          const body = resp.getContentText().substring(0, 100000);
          return jsonOut({ ok: true, status: resp.getResponseCode(), body });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'urlToDrive': {
        // Server-side fetch (bypasses NetFree completely) + save bytes to Drive.
        // Used to grab AI-generated images, large binaries, anything that NetFree
        // intercepts when fetched client-side. Returns Drive file id + direct URL.
        const u = params.url;
        const folderName = params.folder || 'agent_downloads';
        const fileName = params.name || ('download_' + Date.now());
        const mime = params.mime || null;
        if (!u) return jsonOut({ ok: false, error: 'url_required' }, 400);
        try {
          const resp = UrlFetchApp.fetch(u, {
            muteHttpExceptions: true,
            followRedirects: true,
            headers: { 'User-Agent': params.ua || 'Mozilla/5.0' },
            validateHttpsCertificates: false,
          });
          const code = resp.getResponseCode();
          if (code !== 200) {
            return jsonOut({ ok: false, error: 'fetch_failed', status: code }, 500);
          }
          const bytes = resp.getContent();
          let blob = Utilities.newBlob(bytes, mime || resp.getHeaders()['Content-Type'] || 'application/octet-stream', fileName);
          const folder = DriveApp.getFoldersByName(folderName).hasNext()
            ? DriveApp.getFoldersByName(folderName).next()
            : DriveApp.createFolder(folderName);
          const file = folder.createFile(blob);
          const result = {
            ok: true,
            id: file.getId(),
            name: file.getName(),
            size: bytes.length,
            mime: blob.getContentType(),
            url: 'https://drive.google.com/uc?export=download&id=' + file.getId(),
            view: file.getUrl(),
          };
          // Optionally return bytes inline (base64) — useful when caller can't
          // hit Drive API directly. Limited to ~5MB to fit in Apps Script
          // response size budget.
          // Optional XOR with single-byte key — obfuscates payload so DPI on the
          // wire (e.g. NetFree's image-content detector) doesn't recognize the
          // bytes as an image and intercept the response.
          if (params.inline === '1' && bytes.length < 5000000) {
            let outBytes = bytes;
            if (params.xor) {
              const k = parseInt(params.xor, 10) & 0xff;
              outBytes = new Array(bytes.length);
              for (let i = 0; i < bytes.length; i++) {
                outBytes[i] = (bytes[i] ^ k);
                if (outBytes[i] > 127) outBytes[i] -= 256;
              }
            }
            result.dataB64 = Utilities.base64Encode(outBytes);
            if (params.xor) result.xor = parseInt(params.xor, 10);
          }
          return jsonOut(result);
        } catch (e) {
          return jsonOut({ ok: false, error: e.message }, 500);
        }
      }

      case 'transcribeYemot': {
        // Download a Yemot file and transcribe it via timlul-tziburi.
        // Used to read user recordings (e.g., ext 2 responses) when the operator's
        // local network blocks the timlul URL via NetFree filter.
        const path = params.path;
        if (!path) return jsonOut({ ok: false, error: 'missing path (e.g., ivr2:/2/001.wav)' }, 400);
        try {
          const tok = getYemotToken();
          if (!tok) return jsonOut({ ok: false, error: 'no yemot token' }, 500);
          // Download the file
          const dlPayload = `token=${encodeURIComponent(tok)}&path=${encodeURIComponent(path)}`;
          const dlResp = UrlFetchApp.fetch('https://www.call2all.co.il/ym/api/DownloadFile', {
            method: 'post',
            contentType: 'application/x-www-form-urlencoded',
            payload: dlPayload,
            muteHttpExceptions: true,
          });
          if (dlResp.getResponseCode() !== 200) {
            return jsonOut({ ok: false, error: 'download failed', code: dlResp.getResponseCode() }, 500);
          }
          const audioBytes = dlResp.getContent();
          const audioBlob = Utilities.newBlob(audioBytes, 'audio/wav', 'rec.wav');
          // Post to timlul-tziburi
          const trResp = UrlFetchApp.fetch('https://timlul-tziburi.onrender.com/transcribe', {
            method: 'post',
            payload: {
              token: '0772251404:85478577',
              audio: audioBlob,
            },
            muteHttpExceptions: true,
          });
          const code = trResp.getResponseCode();
          const body = trResp.getContentText();
          let parsed = null;
          try { parsed = JSON.parse(body); } catch (e) {}
          return jsonOut({
            ok: code === 200,
            action: 'transcribeYemot',
            path: path,
            audio_bytes: audioBytes ? audioBytes.length : 0,
            code: code,
            transcript: parsed && (parsed.text || parsed.transcript) ? (parsed.text || parsed.transcript) : null,
            parsed: parsed,
            raw: body.substring(0, 2000),
          });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message, stack: e.stack ? e.stack.substring(0, 500) : null }, 500);
        }
      }

      case 'quotaQueue': {
        // Round 4: inspect the quota retry queue.
        const props = PropertiesService.getScriptProperties();
        const queue = JSON.parse(props.getProperty(CONFIG.QUOTA_QUEUE_PROP) || '[]');
        const batched = JSON.parse(props.getProperty(CONFIG.BATCHED_NOTIF_PROP) || '[]');
        const today = new Date().toISOString().substring(0, 10);
        const date = props.getProperty(CONFIG.NOTIF_DAY_DATE_PROP);
        const count = (date === today)
          ? parseInt(props.getProperty(CONFIG.NOTIF_DAY_COUNT_PROP) || '0', 10) : 0;
        return jsonOut({
          ok: true,
          quota_queue_length: queue.length,
          batched_queue_length: batched.length,
          internal_notif_count_today: count,
          internal_notif_cap: CONFIG.MAX_INTERNAL_NOTIFICATIONS_PER_DAY,
          quota_queue_sample: queue.slice(0, 5).map(q => ({
            kind: q.kind, subject: (q.subject || '').substring(0, 80),
            queuedAt: new Date(q.queuedAt).toISOString(),
            attempts: q.attempts || 0,
          })),
        });
      }

      case 'flushQuotaQueue': {
        const r = flushQuotaQueue();
        return jsonOut({ ok: true, action: 'flushQuotaQueue', result: r });
      }

      case 'clearBreaker': {
        // Round 1-5 marathon 2026-05-04: manually clear the quota circuit
        // breaker that has been blocking processNewEmails. Operator-only.
        const props = PropertiesService.getScriptProperties();
        const before = {
          fails: props.getProperty('QUOTA_BREAKER_FAILS'),
          tripped_until: props.getProperty('QUOTA_BREAKER_TRIPPED_UNTIL'),
          date: props.getProperty('QUOTA_BREAKER_DATE'),
        };
        props.setProperty('QUOTA_BREAKER_TRIPPED_UNTIL', '0');
        props.setProperty('QUOTA_BREAKER_FAILS', '0');
        props.setProperty('QUOTA_BREAKER_DATE', new Date().toISOString().substring(0, 10));
        let mailQuota = -1;
        try { mailQuota = MailApp.getRemainingDailyQuota(); } catch (e) {}
        return jsonOut({ ok: true, action: 'clearBreaker', before, mail_quota_remaining: mailQuota });
      }

      case 'breakerStatus': {
        // Round 1-5 marathon 2026-05-04: compact view of breaker state.
        const props = PropertiesService.getScriptProperties();
        const trippedUntilRaw = props.getProperty('QUOTA_BREAKER_TRIPPED_UNTIL') || '0';
        const trippedUntil = parseInt(trippedUntilRaw, 10) || 0;
        const now = Date.now();
        const active = trippedUntil > now && trippedUntil < now + 24 * 60 * 60 * 1000;
        let mailQuota = -1;
        try { mailQuota = MailApp.getRemainingDailyQuota(); } catch (e) {}
        return jsonOut({
          ok: true,
          action: 'breakerStatus',
          breaker_active: active,
          tripped_until_raw: trippedUntilRaw,
          tripped_until_iso: trippedUntil > 0 ? new Date(trippedUntil).toISOString() : null,
          tripped_until_minutes_from_now: trippedUntil > 0 ? Math.round((trippedUntil - now) / 60000) : 0,
          fails: props.getProperty('QUOTA_BREAKER_FAILS'),
          date: props.getProperty('QUOTA_BREAKER_DATE'),
          today: new Date().toISOString().substring(0, 10),
          mail_quota_remaining: mailQuota,
          now_iso: new Date().toISOString(),
        });
      }

      case 'processedDump': {
        // Round 36-45 marathon 2026-05-04: see what's currently in
        // PROCESSED_MSG_IDS so we can compare to the inbox's 16 unread.
        const props = PropertiesService.getScriptProperties();
        const ids = JSON.parse(props.getProperty('PROCESSED_MSG_IDS') || '[]');
        const sentIds = JSON.parse(props.getProperty('AGENT_SENT_MSG_IDS') || '[]');
        let advList = [];
        try {
          const adv = Gmail.Users.Messages.list('me', {
            q: 'in:inbox is:unread newer_than:2d -label:"AI/Done" -label:"AI/Error"',
            maxResults: 30,
          });
          advList = (adv.messages || []).map(m => m.id);
        } catch (e) {}
        const overlap = advList.filter(id => ids.indexOf(id) !== -1);
        const fresh = advList.filter(id => ids.indexOf(id) === -1);
        return jsonOut({
          ok: true,
          processed_count: ids.length,
          last_processed_ids: ids.slice(-10),
          adv_unread_count: advList.length,
          adv_unread_ids: advList,
          overlap_count: overlap.length,
          fresh_count: fresh.length,
          fresh_ids: fresh,
          sent_count: sentIds.length,
        });
      }

      case 'inboxScanAdv': {
        // Round 36-45 marathon 2026-05-04: enumerate the 16 unread inbox
        // messages via Advanced API and show their sender + subject.
        const out = [];
        try {
          const adv = Gmail.Users.Messages.list('me', {
            q: 'in:inbox is:unread newer_than:2d -label:"AI/Done" -label:"AI/Error"',
            maxResults: 30,
          });
          (adv.messages || []).forEach(m => {
            try {
              const msg = Gmail.Users.Messages.get('me', m.id, { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] });
              const hdr = {};
              ((msg.payload && msg.payload.headers) || []).forEach(h => { hdr[h.name.toLowerCase()] = h.value; });
              out.push({
                id: m.id,
                threadId: m.threadId,
                from: hdr.from,
                subject: hdr.subject,
                date: hdr.date,
                labelIds: msg.labelIds || [],
              });
            } catch (e) { out.push({ id: m.id, error: e.message }); }
          });
          return jsonOut({ ok: true, count: out.length, messages: out });
        } catch (e) {
          return jsonOut({ ok: false, error: e.message });
        }
      }

      case 'forceAdvProcess': {
        // Round 36-45 marathon 2026-05-04: directly invoke the Advanced API
        // processor, bypassing the GmailApp probe entirely. Used when we
        // know GmailApp is throttled.
        const log = [];
        const stats = { found: 0, processed: 0, errors: 0, skipped: 0 };
        let result;
        try {
          result = processViaAdvancedApi(log, stats, Date.now());
        } catch (e) {
          return jsonOut({ ok: false, error: e.message, log });
        }
        return jsonOut({ ok: true, action: 'forceAdvProcess', stats, log, result });
      }

      case 'inboxScan': {
        // Round 36-45 marathon 2026-05-04: deep scan to find what email
        // queries are matching. Used to debug "found=0" mystery.
        const out = { ok: true, action: 'inboxScan', results: {} };
        const userEmail = getUserPrimaryEmail();
        const queriesToProbe = [
          'in:inbox',
          'in:inbox newer_than:1d',
          'in:inbox is:unread newer_than:7d',
          'in:inbox is:unread',
          'in:inbox newer_than:1d -label:"AI/Done" -label:"AI/Error" -label:"AI/Processed"',
          'in:inbox is:unread newer_than:7d -from:' + userEmail + ' -label:"AI/Done" -label:"AI/Error" -label:"AI/Processed"',
          '-label:"AI/Processed" -label:"AI/Done" newer_than:1d',
        ];
        try {
          queriesToProbe.forEach(q => {
            try {
              const threads = GmailApp.search(q, 0, 5);
              out.results[q] = {
                count: threads.length,
                samples: threads.slice(0, 3).map(t => ({
                  subject: t.getFirstMessageSubject(),
                  last: t.getMessages()[t.getMessages().length - 1].getFrom(),
                  labels: t.getLabels().map(l => l.getName()),
                })),
              };
            } catch (e) {
              out.results[q] = { error: e.message };
            }
          });
          // Advanced API check too
          try {
            const adv = Gmail.Users.Messages.list('me', { q: 'in:inbox is:unread newer_than:2d -label:"AI/Done" -label:"AI/Error"', maxResults: 10 });
            out.advanced_api_count = (adv.messages || []).length;
            out.advanced_api_resultSizeEstimate = adv.resultSizeEstimate;
          } catch (e) { out.advanced_api_error = e.message; }
        } catch (e) {
          out.error = e.message;
        }
        return jsonOut(out);
      }

      case 'gmailHealth': {
        // Round 16-25 marathon 2026-05-04: probe whether the Gmail service
        // is responding to read calls. Returns immediately, so safe under
        // a throttle.
        const out = { ok: true, action: 'gmailHealth' };
        try {
          const lab = GmailApp.getUserLabels();
          out.labels_count = lab.length;
          out.gmail_app_alive = true;
        } catch (e) {
          out.gmail_app_alive = false;
          out.gmail_app_error = e.message;
        }
        try {
          const profile = Gmail.Users.getProfile('me');
          out.advanced_gmail_alive = true;
          out.email = profile.emailAddress;
          out.thread_count = profile.threadsTotal;
        } catch (e) {
          out.advanced_gmail_alive = false;
          out.advanced_gmail_error = e.message;
        }
        return jsonOut(out);
      }

      case 'forceProcess': {
        // Round 6-10 marathon 2026-05-04: bypass the quota breaker once and
        // call processNewEmails. Used to verify processing works after a
        // manual breaker clear.
        const props = PropertiesService.getScriptProperties();
        const savedTripped = props.getProperty('QUOTA_BREAKER_TRIPPED_UNTIL') || '0';
        props.setProperty('QUOTA_BREAKER_TRIPPED_UNTIL', '0');
        let result;
        try {
          result = processNewEmails();
        } finally {
          // Only restore if the run did not re-trip it itself.
          const after = props.getProperty('QUOTA_BREAKER_TRIPPED_UNTIL') || '0';
          if (after === '0' && savedTripped !== '0') {
            // we leave it cleared — operator chose to force.
          }
        }
        return jsonOut({ ok: true, action: 'forceProcess', result });
      }

      case 'countGenericDrafts': {
        // Round 56 verifier: count drafts that still have the generic ack body
        // versus those with a smart-ack or substantive reply.
        const list = Gmail.Users.Drafts.list('me', { maxResults: 200 });
        const drafts = (list && list.drafts) || [];
        let generic = 0, smart = 0, substantive = 0, errored = 0, scanned = 0;
        const examples = { generic: [], smart: [], substantive: [] };
        for (const d of drafts) {
          try {
            const full = Gmail.Users.Drafts.get('me', d.id, { format: 'full' });
            scanned++;
            const body = extractAdvBodyText(full.message);
            const norm = String(body || '').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
            const hdrs = {};
            ((full.message && full.message.payload && full.message.payload.headers) || [])
              .forEach(h => { hdrs[h.name.toLowerCase()] = h.value; });
            const subj = hdrs.subject || '';
            if (norm.indexOf('ראיתי את המייל שלך בנושא') !== -1) {
              smart++;
              if (examples.smart.length < 2) examples.smart.push({ to: hdrs.to, subject: subj, body: body.substring(0, 250) });
            } else if (norm.indexOf('ראיתי את המייל שלך. אחזור אליך בהקדם') !== -1) {
              generic++;
              if (examples.generic.length < 2) examples.generic.push({ to: hdrs.to, subject: subj, body: body.substring(0, 250) });
            } else {
              substantive++;
              if (examples.substantive.length < 3) examples.substantive.push({ to: hdrs.to, subject: subj, body: body.substring(0, 250) });
            }
          } catch (e) { errored++; }
        }
        return jsonOut({ ok: true, scanned, generic, smart, substantive, errored, examples });
      }

      case 'inspectDraft': {
        // Round 56 debug: inspect a draft's parsed body so we can see what
        // extractAdvBodyText returns vs what the generic-fingerprint matches.
        // Also returns the raw text/html part so we can verify the HTML email
        // formatting is applied correctly post-migration.
        const list = Gmail.Users.Drafts.list('me', { maxResults: 5 });
        const drafts = (list && list.drafts) || [];
        const out = [];
        for (const d of drafts.slice(0, 3)) {
          try {
            const full = Gmail.Users.Drafts.get('me', d.id, { format: 'full' });
            const body = extractAdvBodyText(full.message);
            const html = (typeof extractAdvHtmlBody === 'function') ? extractAdvHtmlBody(full.message) : '';
            const hdrs = {};
            ((full.message && full.message.payload && full.message.payload.headers) || [])
              .forEach(h => { hdrs[h.name.toLowerCase()] = h.value; });
            out.push({
              id: d.id,
              to: hdrs.to,
              subject: hdrs.subject,
              content_type: hdrs['content-type'],
              body_len: body.length,
              body_first_300: body.substring(0, 300),
              html_len: html.length,
              html_first_500: html.substring(0, 500),
              has_phrase: body.indexOf('ראיתי את המייל שלך') !== -1,
              has_phrase_full: body.indexOf('ראיתי את המייל שלך. אחזור אליך בהקדם בעז"ה') !== -1,
              has_brand: html.indexOf('תשובה מהסוכן של') !== -1 || html.indexOf('השוליה של יוסף') !== -1,
            });
          } catch (e) { out.push({ id: d.id, error: e.message }); }
        }
        return jsonOut({ ok: true, drafts: out });
      }

      case 'regenerateDrafts': {
        // Round 56 (2026-05-03): re-process every draft created in the last
        // N hours that has the old generic ack body. Calls the LLM properly
        // with the original message context, then rewrites the draft body in
        // place. Drafts stay drafts — Yosef reviews before sending.
        // forceHtml=1 → migrate ALL drafts in window to multipart/alternative
        // with the new beautifully designed HTML body (header, signature).
        const maxHours = parseInt(params.hours || params.maxHours || '48', 10);
        const limit = parseInt(params.limit || '60', 10);
        const forceHtml = !!(params.forceHtml === '1' || params.forceHtml === 'true' || params.force_html === '1');
        const forceReprocess = !!(params.forceReprocess === '1' || params.forceReprocess === 'true' || params.force_reprocess === '1' || params.re === '1');
        const result = regenerateGenericDrafts({ maxHours, limit, forceHtml, forceReprocess });
        return jsonOut({ ok: !!result.ok, action: 'regenerateDrafts', result });
      }

      case 'testEscalation': {
        // 2026-05-03 escalation upgrade: pass &problem=... and the LLM
        // classifies + drafts an escalation email without sending. Useful
        // for verifying the new acknowledge_and_escalate path end-to-end.
        const problem = (params.problem || params.body || 'מצלמה לא עובדת ביציאה הראשית').toString();
        const sender = params.sender || 'parent@example.com';
        const subject = params.subject || 'דיווח על תקלה';
        const heuristic = (typeof identifyDomainExpert === 'function')
          ? identifyDomainExpert(subject, problem) : null;
        const fullContext = (typeof gatherSenderContext === 'function')
          ? gatherSenderContext(sender) : '';
        const decision = askLlmForAction({
          sender,
          subject,
          body: problem,
          fullContext,
        });
        return jsonOut({
          ok: true,
          action: 'testEscalation',
          input: { sender, subject, problem },
          heuristic_match: heuristic,
          domain_experts_count: Object.keys((CONFIG && CONFIG.DOMAIN_EXPERTS) || {}).length,
          domain_experts_list: (typeof listDomainExperts === 'function') ? listDomainExperts() : [],
          decision,
        });
      }

      case 'escalationStatus': {
        // 2026-05-03 escalation upgrade: inspect open escalations.
        const props = PropertiesService.getScriptProperties();
        const trackerKey = (CONFIG && CONFIG.ESCALATION_TRACKER_PROP) || 'ESCALATION_TRACKER';
        let tracker = {};
        try { tracker = JSON.parse(props.getProperty(trackerKey) || '{}'); } catch (e) {}
        const entries = Object.keys(tracker).map(k => ({
          thread_id: k,
          ...tracker[k],
          age_hours: tracker[k].escalated_at ? Math.round((Date.now() - tracker[k].escalated_at) / 3600000) : null,
        }));
        return jsonOut({
          ok: true,
          action: 'escalationStatus',
          open_count: entries.filter(e => e.status !== 'closed').length,
          closed_count: entries.filter(e => e.status === 'closed').length,
          total: entries.length,
          entries: entries.slice(0, 50),
        });
      }

      case 'processEscalationReplies': {
        const r = (typeof processEscalationReplies === 'function')
          ? processEscalationReplies()
          : { error: 'helper not loaded' };
        return jsonOut({ ok: true, action: 'processEscalationReplies', result: r });
      }

      case 'substantiveTest': {
        // Self-test for the substantive reply prompt: pass sender/subject/body
        // and return the LLM decision JSON without sending a real reply.
        const sender = params.sender || 'test@example.com';
        const subject = params.subject || 'בדיקת תשובה ממשית';
        const body = params.body || 'שלום יוסף, האם תוכל לשלוח לי את שעות הקבלה?';
        const fullContext = (typeof gatherSenderContext === 'function')
          ? gatherSenderContext(sender) + '\n\n' + (typeof gatherDriveContext === 'function' ? gatherDriveContext(subject + ' ' + body) : '')
          : '';
        const decision = askLlmForAction({ sender, subject, body, fullContext });
        return jsonOut({ ok: true, action: 'substantiveTest', decision, fullContextLength: fullContext.length });
      }

      case 'mailQuota': {
        // Round 1 investigation: report Gmail send quota for the deploying user.
        // Free Gmail = 100/day, Workspace = 1500/day.
        let remaining = -1;
        let quotaErr = null;
        try {
          // GmailApp.getDailyQuota() does not exist; use MailApp's same-named.
          // First try via MailApp directly:
          remaining = MailApp.getRemainingDailyQuota();
        } catch (e) {
          quotaErr = e.message;
          // Fallback: probe by getting an authorized empty draft. If Gmail
          // session is fine but MailApp scope absent we still want a number.
          try {
            // Try a no-op send-test via Gmail Advanced API.
            const profile = Gmail.Users.getProfile('me');
            // Workspace accounts typically end with custom domain; gmail.com = personal
            const isPersonal = /@gmail\.com$/i.test(profile.emailAddress || '');
            remaining = isPersonal ? 100 : 1500;
          } catch (ee) { /* no fallback */ }
        }
        const userEmail = (function () {
          try { return Session.getActiveUser().getEmail(); } catch (e) { return null; }
        })();
        const effectiveEmail = (function () {
          try { return Session.getEffectiveUser().getEmail(); } catch (e) { return null; }
        })();
        const tier = remaining >= 1000 ? 'Workspace (1500/day)' :
                    remaining >= 100  ? 'between (transition?)' :
                    remaining >= 0    ? 'Free (100/day) — redeployment needed' :
                                        'unknown';
        return jsonOut({
          ok: true,
          action: 'mailQuota',
          remaining_today: remaining,
          tier_guess: tier,
          active_user: userEmail,
          effective_user: effectiveEmail,
          executeAs_setting: 'USER_DEPLOYING (per appsscript.json)',
          error: quotaErr,
        });
      }

      case 'fixYemotExt5to8': {
        // Round 100 layout — relies on pre-rendered M0000.wav files in each ext dir.
        // 1=record general, 2=record urgent, 3=update, 4=info, 5=emergency menu,
        // 6=admin pincode, 7=tzintzuk template, 8=urgent agent, 9=action log, 9/2=archive.
        const results = {};
        const SET = function(path, ini) {
          try { return yemotApi('UploadTextFile', { what: path, contents: ini }); }
          catch (e) { return { error: e.message }; }
        };

        // Root menu — handlers for 1..9.
        results.root = SET('ivr2:/ext.ini',
          'type=menu\nsay_yemot_msgs=no\nplay_file=M0000.wav\nmax_digits=1\ntimeout=10\nattempts=3\ndont_say_invalid=yes\n' +
          'on_1=goto:/1\non_2=goto:/2\non_3=goto:/3\non_4=goto:/4\non_5=goto:/5\non_6=goto:/6\non_7=goto:/7\non_8=goto:/8\non_9=goto:/9\n' +
          'title=בית התלמוד\n');

        const REC = function(extPath, title, recMax) {
          return 'type=record\ntts_voice=Sivan\nsay_yemot_msgs=no\nplay_file=M0000.wav\nrecord_max=' + recMax + '\n' +
            'api_link=https://timlul-tziburi.onrender.com/transcribe\napi_add_0=token=0772251404:85478577\n' +
            'api_add_1=path=9\napi_add_2=M=/9\napi_add_3=txt=yes\nend_target=/\nafter_record=hangup\ntitle=' + title + '\n';
        };
        const PLAY = function(title) {
          return 'type=playfile\ntts_voice=Sivan\nsay_yemot_msgs=no\nplay_file=M0000.wav\nafter_play=hangup\nend_target=/\ntitle=' + title + '\n';
        };

        results.ext1 = SET('ivr2:/1/ext.ini', REC('1', 'הודעה כללית', 180));
        results.ext2 = SET('ivr2:/2/ext.ini', REC('2', 'הודעה דחופה', 180));
        results.ext3 = SET('ivr2:/3/ext.ini', PLAY('עדכון מיוסף'));
        results.ext4 = SET('ivr2:/4/ext.ini', PLAY('מידע על בית התלמוד'));
        results.ext5 = SET('ivr2:/5/ext.ini',
          'type=menu\ntts_voice=Sivan\nsay_yemot_msgs=no\nplay_file=M0000.wav\nmax_digits=1\ntimeout=10\n' +
          'on_1=tel:100\non_2=tel:101\non_3=tel:102\non_star=goto:/\ntitle=מוקדי חירום\n');
        results.ext6 = SET('ivr2:/6/ext.ini',
          'type=menu\ntts_voice=Sivan\nsay_yemot_msgs=no\nplay_file=M0000.wav\npincode=4415\npincode_say=הקש את הקוד הסודי\npincode_max_repeats=3\nmax_digits=1\ntimeout=12\n' +
          'on_1=goto:/6/1\non_2=goto:/6/2\non_3=goto:/6/3\non_4=goto:/6/4\non_star=goto:/\ntitle=הוראות אישיות\n');
        results.ext6_1 = SET('ivr2:/6/1/ext.ini', REC('6/1', 'הוראה לסוכן', 300));
        results.ext6_2 = SET('ivr2:/6/2/ext.ini', REC('6/2', 'הוראה לסוכן - 2', 300));
        results.ext6_3 = SET('ivr2:/6/3/ext.ini', REC('6/3', 'הוראה לסוכן - 3', 300));
        results.ext6_4 = SET('ivr2:/6/4/ext.ini', REC('6/4', 'הוראה לסוכן - 4', 300));
        results.ext7 = SET('ivr2:/7/ext.ini', 'type=template_add_number\ntitle=הרשמה לצינתוקים\n');
        results.ext8 = SET('ivr2:/8/ext.ini',
          'type=menu\ntts_voice=Sivan\nsay_yemot_msgs=no\nplay_file=M0000.wav\nmax_digits=1\ntimeout=10\n' +
          'on_1=goto:/8/1\non_star=goto:/\ntitle=הודעה דחופה מהסוכן\n');
        results.ext8_1 = SET('ivr2:/8/1/ext.ini', REC('8/1', 'תגובה לסוכן', 180));
        results.ext9 = SET('ivr2:/9/ext.ini',
          'type=menu\ntts_voice=Sivan\nsay_yemot_msgs=no\nplay_file=M0000.wav\nmax_digits=1\ntimeout=5\n' +
          'on_1=goto:/9/2\non_star=goto:/\ntitle=יומן פעולות הסוכן\n');
        results.ext9_2 = SET('ivr2:/9/2/ext.ini',
          'type=playfile\ntts_voice=Sivan\nsay_yemot_msgs=no\nplay_files_in_dir=yes\nfiles_in_dir_order=name_desc\nafter_play=hangup\nend_target=/\ntitle=ארכיון יומן\n');

        return jsonOut({ ok: true, action: 'fixYemotExt5to8', results });
      }

      case 'testFreeTzintzuk': {
        // Round 7 (2026-05-03): test the free tzintzuk path (RunTzintuk + tzl:1).
        // Optional &phone=... parameter activates the full sendTzintzuk()
        // fallback chain (free → paid direct → email). Without phone, just
        // tries the free list call.
        const phone = params.phone || '';
        const ctx = params.context || 'בדיקת צינתוק חינמי מ webhook';
        let result;
        if (phone) {
          result = sendTzintzuk(phone, ctx);
        } else {
          result = freeTzintzukCall(ctx);
        }
        return jsonOut({
          ok: !!(result && result.ok),
          action: 'testFreeTzintzuk',
          result: result,
          tip: 'אם המצב empty: התקשר ל-' + YEMOT_CONFIG.CALLER_ID +
               ' והקש ' + ((CONFIG && CONFIG.FREE_TZINTZUK_REGISTER_EXT) || '7') +
               ' להירשם לרשימת הצינתוק החינמי',
        });
      }

      case 'tzintzukLists': {
        // List all tzl: subscription lists on the Yemot account.
        const r = yemotApi('TzintukimListManagement', { action: 'getlists' });
        return jsonOut({
          ok: !!(r && r.responseStatus === 'OK'),
          action: 'tzintzukLists',
          lists: r && r.lists ? r.lists : [],
          raw: r,
        });
      }

      case 'tzintzukSubscribers': {
        // List subscribers in a specific tzl: list (default list 1).
        const listId = params.list || (CONFIG && CONFIG.FREE_TZINTZUK_LIST_ID) || '1';
        const r = yemotApi('TzintukimListManagement', {
          action: 'getlistEnteres',
          TzintukimList: listId,
        });
        return jsonOut({
          ok: !!(r && r.responseStatus === 'OK'),
          action: 'tzintzukSubscribers',
          list: listId,
          subscribers: r && r.entries ? r.entries : (r && r.phones ? r.phones : []),
          raw: r,
        });
      }

      case 'setupFreeTzintzuk': {
        // One-shot: configure ext 7 as a tzintuk admin extension so users
        // calling 0772251404→7 can self-register to the free list.
        const listId = (CONFIG && CONFIG.FREE_TZINTZUK_LIST_ID) || '1';
        const ext = (CONFIG && CONFIG.FREE_TZINTZUK_REGISTER_EXT) || '7';
        const ini =
          'type=template_add_number\n' +
          'list_tzintuk=' + listId + '\n' +
          'tts_voice=Sivan\n' +
          'say_yemot_msgs=no\n' +
          'title=הרשמה לצינתוקים\n';
        const r = yemotApi('UploadTextFile', {
          what: 'ivr2:/' + ext + '/ext.ini',
          contents: ini,
        });
        return jsonOut({
          ok: !!(r && r.responseStatus === 'OK'),
          action: 'setupFreeTzintzuk',
          extension: ext,
          list_id: listId,
          instruction: 'התקשר ל-' + YEMOT_CONFIG.CALLER_ID + ' ולחץ ' + ext +
                       ' כדי להירשם לרשימת הצינתוק החינמי',
          raw: r,
        });
      }

      case 'skipFilterTest': {
        // Test the SKIP filter. Pass &from=...&subject=... to check whether
        // a given sender/subject pair would be skipped (community help group,
        // newsletter, no-reply, etc.).
        const fromArg = (params.from || '').toString();
        const subjArg = (params.subject || '').toString();
        const verdict = evaluateSkipFilter(fromArg, subjArg);
        return jsonOut({
          ok: true,
          action: 'skipFilterTest',
          input: { from: fromArg, subject: subjArg },
          would_skip: verdict.blocked,
          reason: verdict.reason,
          matched_rule: verdict.match,
          blocked_senders: CONFIG.BLOCKED_SENDERS || [],
          blocked_domain_patterns: CONFIG.BLOCKED_DOMAIN_PATTERNS || [],
          blocked_subject_patterns: CONFIG.BLOCKED_SUBJECT_PATTERNS || [],
        });
      }

      case 'cleanupGroupDrafts': {
        // Delete drafts that were created for community help groups
        // (matched by sender or subject pattern). Returns the count
        // deleted plus a sample of remaining (legitimate) drafts.
        const deleted = [];
        const remaining = [];
        let errors = 0;
        try {
          const drafts = GmailApp.getDrafts();
          drafts.forEach(d => {
            try {
              const m = d.getMessage();
              const to = m.getTo() || '';
              const from = m.getFrom() || '';
              const subj = m.getSubject() || '';
              // The "from" of a draft is the user; the recipient ("to")
              // tells us who we'd be replying to.
              const replyTarget = (to.match(/[\w.+-]+@[\w.-]+\.[\w.-]+/) || [''])[0].toLowerCase();
              const v = evaluateSkipFilter(replyTarget, subj);
              if (v.blocked) {
                deleted.push({
                  id: d.getId(), to: to, subject: subj.substring(0, 80),
                  reason: v.reason, match: v.match,
                });
                d.deleteDraft();
              } else if (remaining.length < 10) {
                remaining.push({
                  id: d.getId(), to: to, subject: subj.substring(0, 80),
                  snippet: (m.getPlainBody() || '').substring(0, 120),
                });
              }
            } catch (de) { errors++; }
          });
        } catch (e) {
          // GmailApp throttled — try Advanced API.
          try {
            const list = Gmail.Users.Drafts.list('me', { maxResults: 100 });
            (list.drafts || []).forEach(d => {
              try {
                const full = Gmail.Users.Drafts.get('me', d.id, {
                  format: 'metadata', metadataHeaders: ['To', 'Subject', 'From'],
                });
                const hdr = {};
                ((full.message && full.message.payload && full.message.payload.headers) || [])
                  .forEach(h => { hdr[h.name.toLowerCase()] = h.value; });
                const replyTarget = ((hdr.to || '').match(/[\w.+-]+@[\w.-]+\.[\w.-]+/) || [''])[0].toLowerCase();
                const v = evaluateSkipFilter(replyTarget, hdr.subject || '');
                if (v.blocked) {
                  deleted.push({
                    id: d.id, to: hdr.to, subject: (hdr.subject || '').substring(0, 80),
                    reason: v.reason, match: v.match,
                  });
                  Gmail.Users.Drafts.remove('me', d.id);
                } else if (remaining.length < 10) {
                  remaining.push({
                    id: d.id, to: hdr.to, subject: (hdr.subject || '').substring(0, 80),
                    snippet: (full.message && full.message.snippet || '').substring(0, 120),
                  });
                }
              } catch (de) { errors++; }
            });
          } catch (e2) {
            return jsonOut({ ok: false, error: 'both_paths_failed: ' + e.message + ' / ' + e2.message }, 500);
          }
        }
        return jsonOut({
          ok: true,
          action: 'cleanupGroupDrafts',
          deleted_count: deleted.length,
          deleted: deleted.slice(0, 50),
          sample_remaining: remaining,
          errors,
        });
      }

      case 'testVoiceCommand': {
        // Marathon 2026-05-04: verify Voice module dispatch end to end.
        const cmd = String(params.command || '').substring(0, 500);
        if (!cmd) return jsonOut({ ok: false, error: 'missing command' }, 400);
        // Default skipCallback=1 so a webhook test does not actually trigger
        // a tzintzuk to the user. Pass &callback=1 to enable.
        const opts = { skipCallback: params.callback !== '1' };
        const r = (typeof Voice !== 'undefined')
          ? Voice.processVoiceCommand(cmd, opts)
          : { ok: false, error: 'Voice module not loaded' };
        return jsonOut({ ok: !!r.ok, action: 'testVoiceCommand', command: cmd, result: r });
      }

      case 'runCommand': {
        // Remote command channel — direct API trigger. Pass &command=<text>
        // (or &commandB64=<base64>) and the text is dispatched via Voice exactly
        // like a phone command, but the result comes back in the JSON response
        // (no Yemot callback). Useful from external scripts / Claude Code.
        let cmd = String(params.command || '').trim();
        if (!cmd && params.commandB64) {
          try { cmd = Utilities.newBlob(Utilities.base64Decode(params.commandB64)).getDataAsString('UTF-8').trim(); }
          catch (e) {}
        }
        cmd = cmd.substring(0, 1500);
        if (!cmd) return jsonOut({ ok: false, error: 'missing command' }, 400);
        const skipCb = params.callback !== '1';
        const r = (typeof Voice !== 'undefined' && Voice.processVoiceCommand)
          ? Voice.processVoiceCommand(cmd, { skipCallback: skipCb })
          : { ok: false, error: 'Voice module not loaded' };
        return jsonOut({ ok: !!r.ok, action: 'runCommand', command: cmd, result: r });
      }

      case 'processCommandLabel': {
        // Force-scan the AI/Command label and run any pending commands now.
        const r = (typeof processCommandLabelInbox === 'function')
          ? processCommandLabelInbox(parseInt(params.limit || '10', 10))
          : { error: 'helper not loaded' };
        return jsonOut({ ok: !!(r && r.ok !== false), action: 'processCommandLabel', result: r });
      }

      case 'auditDocSharing': {
        // Inspect the sharing posture of any Drive file by ID. Used to verify
        // that compile_and_forward / generate_doc outputs are private.
        const id = params.docId || params.id;
        if (!id) return jsonOut({ ok: false, error: 'missing docId' }, 400);
        const r = (typeof auditDocSharing === 'function')
          ? auditDocSharing(id) : { error: 'helper not loaded' };
        return jsonOut({ ok: !!r.ok, action: 'auditDocSharing', sharing: r });
      }

      case 'parseVoiceIntent': {
        // Lightweight: classify the transcript without dispatching.
        const cmd = String(params.command || '').substring(0, 500);
        if (!cmd) return jsonOut({ ok: false, error: 'missing command' }, 400);
        const r = (typeof Voice !== 'undefined')
          ? Voice.parseIntent(cmd)
          : { intent: 'unknown', error: 'Voice not loaded' };
        return jsonOut({ ok: true, action: 'parseVoiceIntent', command: cmd, parsed: r });
      }

      case 'refreshVoiceExtensions': {
        // Re-render audio for ext 2 (digest), 3 (urgent), 4 (drafts), 6 (status).
        const r = (typeof refreshAllVoiceExtensions === 'function')
          ? refreshAllVoiceExtensions()
          : { error: 'helper not loaded' };
        return jsonOut({ ok: true, action: 'refreshVoiceExtensions', result: r });
      }

      case 'uploadDailyDigestAudio': {
        const r = (typeof uploadDailyDigestAudio === 'function')
          ? uploadDailyDigestAudio()
          : { error: 'helper not loaded' };
        return jsonOut({ ok: !!r.ok, action: 'uploadDailyDigestAudio', result: r });
      }

      // Marathon 2026-05-04 item 12: performance dashboard.
      case 'stats': {
        const r = (typeof getAgentStats24h === 'function')
          ? getAgentStats24h()
          : { error: 'helper not loaded' };
        return jsonOut({ ok: true, action: 'stats', stats: r });
      }

      // Marathon 2026-05-04 item 15: archive old AI threads (30+ days, no further action).
      case 'archiveOld': {
        const r = (typeof archiveOldAiThreads === 'function')
          ? archiveOldAiThreads(parseInt(params.days || '30', 10))
          : { error: 'helper not loaded' };
        return jsonOut({ ok: !!r && r.archived !== undefined, action: 'archiveOld', result: r });
      }

      // Marathon 2026-05-04 item 14: proactive alerts — detect senders with
      // 3+ unanswered messages and notify the user.
      case 'proactiveAlerts': {
        const r = (typeof runProactiveAlerts === 'function')
          ? runProactiveAlerts()
          : { error: 'helper not loaded' };
        return jsonOut({ ok: true, action: 'proactiveAlerts', result: r });
      }

      // Marathon 2026-05-04 item 8 + calendar-integration: scan inbox for
      // meeting emails, create events on primary calendar, auto-reply with
      // calendar link. Spec: ?action=scanCalendarFromEmails&hours=24
      case 'scanCalendarFromEmails': {
        const hours = parseInt(params.hours || '24', 10);
        const limit = parseInt(params.limit || '30', 10);
        const r = (typeof scanInboxForCalendarEventsByHours === 'function')
          ? scanInboxForCalendarEventsByHours(hours, limit)
          : ((typeof scanInboxForCalendarEvents === 'function')
              ? scanInboxForCalendarEvents(limit)
              : { error: 'helper not loaded' });
        return jsonOut({ ok: true, action: 'scanCalendarFromEmails', hours: hours, result: r });
      }

      // Marathon 2026-05-04 (calendar-integration): test extraction without
      // touching the calendar. Spec: ?action=testExtractEvent&text=<urlenc>
      case 'testExtractEvent': {
        if (typeof extractEventDetails !== 'function') {
          return jsonOut({ ok: false, error: 'extractEventDetails not loaded' }, 500);
        }
        const text = params.text || '';
        const sender = params.sender || '';
        const detail = extractEventDetails(text, sender);
        const parsed = parseHebrewDateTime(text);
        return jsonOut({
          ok: true, action: 'testExtractEvent',
          input: text,
          parsed_iso: parsed ? parsed.toISOString() : null,
          parsed_friendly: parsed ? formatHebrewDateTime(parsed.toISOString()) : null,
          extracted: detail,
        });
      }

      // Marathon 2026-05-04 (smart-aggregation): list current similar-thread clusters.
      // Spec: ?action=findAggregations[&hours=24]
      case 'findAggregations': {
        if (typeof findAggregations !== 'function') {
          return jsonOut({ ok: false, error: 'Aggregator not loaded' }, 500);
        }
        const r = findAggregations(parseInt(params.hours || '24', 10));
        return jsonOut(Object.assign({ action: 'findAggregations' }, r));
      }

      // Marathon 2026-05-04 (smart-aggregation): aggregated reply on a cluster.
      // Spec: ?action=aggregateReply&threadIds=id1,id2[,id3][&body=<combined>]
      case 'aggregateReply': {
        if (typeof aggregateAndReply !== 'function') {
          return jsonOut({ ok: false, error: 'Aggregator not loaded' }, 500);
        }
        const ids = (params.threadIds || '').split(',').map(s => s.trim()).filter(Boolean);
        if (ids.length < 2) {
          return jsonOut({ ok: false, error: 'aggregateReply: need 2+ thread ids' }, 400);
        }
        const threads = ids.map(id => {
          try { return GmailApp.getThreadById(id); } catch (e) { return null; }
        }).filter(Boolean);
        if (threads.length < 2) {
          return jsonOut({ ok: false, error: 'aggregateReply: could not load threads' }, 400);
        }
        const r = aggregateAndReply(threads, { combinedReply: params.body || null });
        return jsonOut(Object.assign({ action: 'aggregateReply' }, r));
      }

      // Marathon 2026-05-04: trigger free tzintzuk by name from external scripts.
      case 'triggerFreeTzintzuk': {
        const r = (typeof freeTzintzukCall === 'function')
          ? freeTzintzukCall((params.context || 'מרתון שיפורים').substring(0, 100))
          : { error: 'helper not loaded' };
        return jsonOut({ ok: !!(r && r.ok), action: 'triggerFreeTzintzuk', result: r });
      }

      // ============================================================
      // Drafts approval / auto-send system (DraftsApproval.gs)
      // ============================================================

      // Approve all pending drafts.
      case 'approveAllDrafts': {
        const r = (typeof approveDrafts === 'function')
          ? approveDrafts({ all: true })
          : { ok: false, error: 'DraftsApproval not loaded' };
        return jsonOut(Object.assign({ action: 'approveAllDrafts' }, r));
      }

      // Approve a single draft. Selectors: id, to, first, index.
      case 'approveDraft': {
        if (typeof approveDrafts !== 'function') {
          return jsonOut({ ok: false, error: 'DraftsApproval not loaded' }, 500);
        }
        const sel = {};
        if (params.id) sel.id = params.id;
        else if (params.to) sel.to = params.to;
        else if (params.first === '1' || params.first === 'true') sel.first = true;
        else if (typeof params.index !== 'undefined') sel.index = parseInt(params.index, 10);
        else return jsonOut({ ok: false, error: 'missing selector (id|to|first|index)' }, 400);
        const r = approveDrafts(sel);
        return jsonOut(Object.assign({ action: 'approveDraft', selector: sel }, r));
      }

      // Delete a draft (or all drafts) without sending.
      case 'deleteDraft': {
        if (typeof deleteDrafts !== 'function') {
          return jsonOut({ ok: false, error: 'DraftsApproval not loaded' }, 500);
        }
        const sel = {};
        if (params.all === '1' || params.all === 'true') sel.all = true;
        else if (params.id) sel.id = params.id;
        else if (params.to) sel.to = params.to;
        else if (params.first === '1' || params.first === 'true') sel.first = true;
        else return jsonOut({ ok: false, error: 'missing selector (id|to|first|all)' }, 400);
        const r = deleteDrafts(sel);
        return jsonOut(Object.assign({ action: 'deleteDraft', selector: sel }, r));
      }

      // Toggle auto-send mode (default off). Pass &enabled=1 / 0.
      case 'setAutoSend': {
        if (typeof setAutoSendEnabled !== 'function') {
          return jsonOut({ ok: false, error: 'DraftsApproval not loaded' }, 500);
        }
        const enabled = params.enabled === '1' || params.enabled === 'true';
        const r = setAutoSendEnabled(enabled);
        // Optionally update requires struct via &requires=<json>
        let requires = null;
        if (params.requires) {
          try {
            const parsed = JSON.parse(params.requires);
            requires = setAutoSendRequires(parsed);
          } catch (e) { requires = { ok: false, error: e.message }; }
        }
        return jsonOut(Object.assign({ action: 'setAutoSend' }, r,
          requires ? { requires: requires } : {}));
      }

      // Inspect auto-send config + audit log.
      case 'autoSendStatus': {
        if (typeof isAutoSendEnabled !== 'function') {
          return jsonOut({ ok: false, error: 'DraftsApproval not loaded' }, 500);
        }
        return jsonOut({
          ok: true,
          action: 'autoSendStatus',
          enabled: isAutoSendEnabled(),
          requires: getAutoSendRequires(),
          audit_log_recent: getAutoSendAuditLog().slice(-10),
          autonomous_senders: CONFIG.AUTONOMOUS_SENDERS || [],
        });
      }

      // List pending drafts with the same struct used by the readout.
      case 'pendingDrafts': {
        if (typeof listPendingDrafts !== 'function') {
          return jsonOut({ ok: false, error: 'DraftsApproval not loaded' }, 500);
        }
        // 2026-05-06: cached for 2 min — watch_drafts polls every 2 min
        // and burning Gmail draft API quota. Cache cuts repeats.
        const cache = CacheService.getScriptCache();
        const ckey = 'pending_drafts_' + (params.limit || '30');
        let drafts = null;
        if (cache && params.fresh !== '1') {
          const c = cache.get(ckey);
          if (c) { try { drafts = JSON.parse(c); } catch {} }
        }
        if (!drafts) {
          drafts = listPendingDrafts(parseInt(params.limit || '30', 10));
          if (cache) {
            try { cache.put(ckey, JSON.stringify(drafts), 120); } catch {}
          }
        }
        return jsonOut({
          ok: true, action: 'pendingDrafts',
          count: drafts.length, drafts,
        });
      }

      // Render the drafts readout TTS without uploading (preview).
      case 'draftsReadout': {
        if (typeof buildDraftsReadoutTts !== 'function') {
          return jsonOut({ ok: false, error: 'DraftsApproval not loaded' }, 500);
        }
        const upload = params.upload === '1' || params.upload === 'true';
        const tts = buildDraftsReadoutTts({ max: parseInt(params.max || '10', 10) });
        let uploadResult = null;
        if (upload && typeof refreshDraftsAudio === 'function') {
          try { uploadResult = refreshDraftsAudio(); }
          catch (e) { uploadResult = { ok: false, error: e.message }; }
        }
        return jsonOut({
          ok: true, action: 'draftsReadout',
          tts_length: tts.length, tts: tts,
          uploaded: uploadResult,
        });
      }

      // Force-refresh ext 4 drafts audio (also runs daily at 06:00 via trigger).
      case 'refreshDraftsAudio': {
        if (typeof refreshDraftsAudio !== 'function') {
          return jsonOut({ ok: false, error: 'DraftsApproval not loaded' }, 500);
        }
        const r = refreshDraftsAudio();
        return jsonOut(Object.assign({ action: 'refreshDraftsAudio' }, r));
      }

      // ============================================
      // CRM + WhatsApp routes (2026-05-04)
      // ============================================

      // Lookup full Memory entry for a person.
      // ?action=getContact&email=X
      case 'getContact': {
        const email = String(params.email || '').trim();
        if (!email) return jsonOut({ ok: false, error: 'missing email' }, 400);
        const ctx = (typeof getPersonContext === 'function')
          ? getPersonContext(email) : null;
        if (!ctx) return jsonOut({ ok: false, error: 'memory not loaded' }, 500);
        let waLink = null;
        try {
          if (ctx.preferred_contact === 'whatsapp' && ctx.phone &&
              typeof buildWhatsappLink === 'function') {
            waLink = buildWhatsappLink(ctx.phone, '');
          }
        } catch (e) { /* skip */ }
        return jsonOut(Object.assign({ ok: true, action: 'getContact', whatsapp_link: waLink }, ctx));
      }

      // Aggregate stats: total contacts / decisions / preferred_contact split
      // / top correspondents.
      case 'crmStats': {
        if (typeof crmStats !== 'function') {
          return jsonOut({ ok: false, error: 'Memory not loaded' }, 500);
        }
        return jsonOut({ ok: true, action: 'crmStats', stats: crmStats() });
      }

      // Full CRM profile for a person (alias of getContact, keeps the
      // documented action name from the brief).
      case 'crmGetPerson': {
        const email = String(params.email || '').trim();
        if (!email) return jsonOut({ ok: false, error: 'missing email' }, 400);
        const ctx = (typeof getPersonContext === 'function')
          ? getPersonContext(email) : null;
        return jsonOut({ ok: !!(ctx && ctx.found), action: 'crmGetPerson', person: ctx });
      }

      // Decision history for a person.
      // ?action=crmListDecisions&person=X[&limit=N]
      case 'crmListDecisions': {
        if (typeof listDecisions !== 'function') {
          return jsonOut({ ok: false, error: 'Memory not loaded' }, 500);
        }
        const person = String(params.person || params.email || '').trim();
        const limit = parseInt(params.limit || '50', 10) || 50;
        const decisions = listDecisions(person || null, limit);
        return jsonOut({ ok: true, action: 'crmListDecisions', person: person, count: decisions.length, decisions: decisions });
      }

      // Append a decision row.
      // ?action=crmRecordDecision&person=X&topic=Y&decision=Z[&outcome=&reason=]
      case 'crmRecordDecision': {
        if (typeof recordDecision !== 'function') {
          return jsonOut({ ok: false, error: 'Memory not loaded' }, 500);
        }
        const person = String(params.person || params.email || '').trim();
        const topic = String(params.topic || '').trim();
        const decision = String(params.decision || '').trim();
        if (!person || !decision) return jsonOut({ ok: false, error: 'missing person/decision' }, 400);
        const r = recordDecision(person, topic, decision, {
          outcome: params.outcome || '',
          reason: params.reason || '',
          relatedEmails: params.related || '',
        });
        return jsonOut(Object.assign({ ok: true, action: 'crmRecordDecision' }, r || {}));
      }

      // Update preferred contact channel for a person.
      // ?action=crmSetPreferred&email=X&type=whatsapp|email|phone
      case 'crmSetPreferred': {
        if (typeof updatePreferredContact !== 'function') {
          return jsonOut({ ok: false, error: 'Memory not loaded' }, 500);
        }
        const email = String(params.email || '').trim();
        const type = String(params.type || '').trim();
        const r = updatePreferredContact(email, type);
        return jsonOut(Object.assign({ action: 'crmSetPreferred' }, r));
      }

      // Build a wa.me link for a known sender + a custom message.
      // ?action=whatsappLink&email=X&text=hello
      // Or pass &phone=... directly to skip the Memory lookup.
      case 'whatsappLink': {
        if (typeof buildWhatsappLink !== 'function') {
          return jsonOut({ ok: false, error: 'Whatsapp module not loaded' }, 500);
        }
        const email = String(params.email || '').trim();
        const text = String(params.text || '');
        let phone = String(params.phone || '').trim();
        if (!phone && email && typeof getPhoneFromMemory === 'function') {
          phone = getPhoneFromMemory(email) || '';
        }
        if (!phone) return jsonOut({ ok: false, error: 'no phone resolved', email: email });
        const link = buildWhatsappLink(phone, text);
        return jsonOut({ ok: !!link, action: 'whatsappLink', email: email, phone: phone, link: link });
      }

      // Smoke test for the WhatsApp module (phone normalization + link
      // builder). Useful from a session to verify deploy.
      case 'whatsappTest': {
        if (typeof whatsappSmokeTest !== 'function') {
          return jsonOut({ ok: false, error: 'Whatsapp module not loaded' }, 500);
        }
        return jsonOut(Object.assign({ ok: true, action: 'whatsappTest' }, whatsappSmokeTest()));
      }

      // ============================================================
      // Personal stats dashboard — full HTML page (Stats.gs).
      // Browser-friendly: returns HTML, not JSON. Auto-refresh 30s.
      // ============================================================
      case 'dashboard': {
        if (typeof gatherDashboardData !== 'function' || typeof renderDashboardHtml !== 'function') {
          return htmlAuthError_('Stats.gs not loaded — re-deploy with Stats.gs included.');
        }
        const dashData = gatherDashboardData();
        const html = renderDashboardHtml(dashData);
        return HtmlService.createHtmlOutput(html)
          .setTitle('לוח בקרה — סוכן הדואר')
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      }

      // 2026-05-04 — JSON variant of the dashboard for external clients
      // (GitHub Pages dashboard, mobile apps, etc.). Same data as `dashboard`
      // but as pure JSON. Apps Script automatically allows CORS for
      // ContentService responses, so any origin can fetch this.
      case 'statsJson': {
        if (typeof gatherDashboardData !== 'function') {
          return jsonOut({ ok: false, error: 'Stats.gs not loaded' }, 500);
        }
        const d = gatherDashboardData();
        // Massage the structure to match the documented public schema while
        // preserving all the original fields for clients that already know
        // about them.
        const today = d.today || {};
        const week = (d.week || []).map(w => w.count || 0);
        const week_detail = d.week || [];
        const actions = d.actions || {};
        const top = (d.top_senders || []).map(s => ({
          email: s.email, name: s.name || '', count: s.count,
        }));
        const escalations = ((d.escalations && d.escalations.recent) || []).map(e => ({
          sender: e.sender, domain: e.domain, status: e.status,
          age_hours: e.age_hours, summary: e.summary, expert: e.expert,
        }));
        const drafts_pending = ((d.pending && d.pending.items) || []).map(it => ({
          id: it.id, to: it.to, to_email: it.to_email,
          subject: it.subject, snippet: it.snippet, date: it.date,
        }));
        const triggers = ((d.triggers && d.triggers.list) || []).map(t => ({
          name: t.handler, source: t.source, last_run: t.last_run,
        }));
        return jsonOut({
          ok: true,
          action: 'statsJson',
          generated_at: d.generated_at,
          generated_at_local: d.generated_at_local,
          user_email: d.user_email,
          today: {
            received: today.received || 0,
            processed: today.processed || 0,
            replied: today.replied || 0,
            drafted: today.drafted || 0,
            deferred: today.deferred || 0,
            skipped: today.skipped || 0,
            errors: today.errors || 0,
          },
          week: week,
          week_detail: week_detail,
          actions: {
            substantive_reply: actions.substantive_reply || 0,
            draft_and_notify: actions.draft_and_notify || 0,
            defer_to_digest: actions.defer || 0,
            acknowledge: actions.acknowledge || 0,
            escalate: actions.escalate || 0,
            skip: actions.skip || 0,
            other: actions.other || 0,
          },
          top_senders: top,
          escalations: escalations,
          escalations_summary: {
            open: (d.escalations && d.escalations.open) || 0,
            closed: (d.escalations && d.escalations.closed) || 0,
            total: (d.escalations && d.escalations.total) || 0,
          },
          drafts_pending: drafts_pending,
          drafts_count: (d.pending && d.pending.count) || 0,
          triggers: triggers,
          triggers_count: (d.triggers && d.triggers.count) || 0,
          quota: d.quota || { mail_remaining: -1, breaker_active: false },
          yemot: d.yemot || { processed_total: 0, last_call: null },
          auto_send: d.auto_send || { enabled: false, audit_log_size: 0 },
        });
      }

      // 2026-05-04 — one-shot OCR self-test: generate a synthetic Hebrew PNG
      // in-script (drawn via SVG -> base64 not feasible in Apps Script), so
      // instead we accept an inline base64 PDF/PNG in `b64` + `mime` and
      // run OCR directly without needing a Gmail message. Useful for unit-
      // testing the vision pipeline end-to-end from an external caller.
      case 'ocrInline': {
        if (typeof _ocrCallClaude !== 'function') {
          return jsonOut({ ok: false, error: 'Ocr.gs not loaded' }, 500);
        }
        const b64 = params.b64;
        const mime = params.mime || 'application/pdf';
        if (!b64) return jsonOut({ ok: false, error: 'missing b64' }, 400);
        let text = null, source = null, claudeErr = null, geminiErr = null;
        try { text = _ocrCallClaude(b64, mime); if (text) source = 'claude_haiku_4_5'; }
        catch (e) { claudeErr = e.message; }
        if (!text) {
          try {
            const blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, 'inline.bin');
            text = _ocrCallGeminiFallback(blob);
            if (text) source = 'gemini_fallback';
          } catch (e2) { geminiErr = e2.message; }
        }
        return jsonOut({
          ok: !!text, action: 'ocrInline', source,
          text: text || '', length: text ? text.length : 0,
          claude_error: claudeErr, gemini_error: geminiErr,
          claude_debug: (typeof _ocrGetLastDebug === 'function') ? _ocrGetLastDebug() : '',
          mime, b64_length: b64.length,
        });
      }

      // 2026-05-04 — find a recent message that has an attachment (OCR sanity check).
      case 'findOcrCandidate': {
        try {
          const q = params.q || 'has:attachment newer_than:30d';
          const list = Gmail.Users.Messages.list('me', { q: q, maxResults: 10 });
          const out = [];
          (list.messages || []).forEach(m => {
            try {
              const full = Gmail.Users.Messages.get('me', m.id, {
                format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'],
              });
              const hdr = {};
              ((full.payload && full.payload.headers) || []).forEach(h => { hdr[h.name.toLowerCase()] = h.value; });
              // Walk parts for attachment names
              const atts = [];
              function walk(p) {
                if (!p) return;
                if (p.filename && p.body && p.body.attachmentId) {
                  atts.push({ filename: p.filename, mime: p.mimeType, size: p.body.size, attachmentId: p.body.attachmentId });
                }
                (p.parts || []).forEach(walk);
              }
              walk(full.payload);
              if (atts.length) {
                out.push({
                  messageId: m.id,
                  from: hdr.from,
                  subject: hdr.subject,
                  date: hdr.date,
                  attachments: atts,
                });
              }
            } catch (e) { /* skip */ }
          });
          return jsonOut({ ok: true, action: 'findOcrCandidate', count: out.length, items: out });
        } catch (e) {
          return jsonOut({ ok: false, action: 'findOcrCandidate', error: e.message }, 500);
        }
      }

      // 2026-05-04 — OCR a specific message (returns extracted text per attachment).
      case 'ocrTest': {
        if (typeof ocrTest !== 'function') {
          return jsonOut({ ok: false, error: 'Ocr.gs not loaded' }, 500);
        }
        const messageId = params.messageId;
        if (!messageId) return jsonOut({ ok: false, error: 'missing messageId' }, 400);
        try {
          const r = ocrTest(messageId);
          return jsonOut(Object.assign({ action: 'ocrTest' }, r));
        } catch (e) {
          return jsonOut({ ok: false, action: 'ocrTest', error: e.message }, 500);
        }
      }

      // 2026-05-04 — Daily morning briefing (build + upload to Yemot ext 2).
      case 'generateBriefingNow': {
        if (typeof generateBriefingNow !== 'function') {
          return jsonOut({ ok: false, error: 'MorningSummary.gs not loaded' }, 500);
        }
        try {
          const r = generateBriefingNow();
          return jsonOut(Object.assign({ ok: true, action: 'generateBriefingNow' }, r));
        } catch (e) {
          return jsonOut({ ok: false, action: 'generateBriefingNow', error: e.message }, 500);
        }
      }

      // Build the briefing text only (no upload). Useful for previews.
      case 'briefingText': {
        if (typeof buildDailyBriefing !== 'function') {
          return jsonOut({ ok: false, error: 'MorningSummary.gs not loaded' }, 500);
        }
        try {
          const r = buildDailyBriefing();
          return jsonOut({ ok: true, action: 'briefingText', text: r.text, stats: r.stats });
        } catch (e) {
          return jsonOut({ ok: false, action: 'briefingText', error: e.message }, 500);
        }
      }

      // 2026-05-04 — Live tail feed for the GitHub Pages dashboard.
      // Returns the latest agent activity in real-time, merging multiple
      // sources into a single timeline:
      //   * Conversations sheet (per-thread agent actions)
      //   * Recent drafts the agent created
      //   * LAST_PROCESS_RUN_AT / LAST_TRIGGER_HEAL / LAST_BULK_MOVE / LAST_REVIEW_AT
      //   * Quota breaker state (LAST_QUOTA_FAIL → tripped flag)
      //   * Yemot processed inbox count
      // Designed to be FAST (<1s) — polled every 3 seconds by clients.
      case 'tail': {
        try {
          const limit = Math.min(parseInt(params.limit || '50', 10) || 50, 100);
          const events = [];
          const props = PropertiesService.getScriptProperties().getProperties();

          // ---- Source 1: Conversations sheet (last N rows) ----
          try {
            const ss = getMemorySheet();
            const sh = ss.getSheetByName(MEM_SHEETS.CONVERSATIONS);
            if (sh) {
              const lastRow = sh.getLastRow();
              if (lastRow > 1) {
                const startRow = Math.max(2, lastRow - limit);
                const numRows = lastRow - startRow + 1;
                const rows = sh.getRange(startRow, 1, numRows, 5).getValues();
                rows.forEach(r => {
                  const dateRaw = r[4];
                  let ts = '';
                  if (dateRaw instanceof Date) ts = dateRaw.toISOString();
                  else if (dateRaw) {
                    const p = Date.parse(String(dateRaw));
                    ts = p ? new Date(p).toISOString() : String(dateRaw);
                  }
                  const action = String(r[2] || '').toLowerCase().trim();
                  const summary = String(r[3] || '').substring(0, 200);
                  const sender = String(r[1] || '');
                  let kind = 'process';
                  if (action.indexOf('escal') !== -1) kind = 'urgent';
                  else if (action.indexOf('error') !== -1 || action.indexOf('fail') !== -1) kind = 'error';
                  else if (action.indexOf('draft') !== -1) kind = 'draft_created';
                  else if (action.indexOf('skip') !== -1) kind = 'process';
                  events.push({
                    ts: ts,
                    kind: kind,
                    summary: summary || (action || 'process') + ' — ' + sender,
                    details: 'from ' + sender + (action ? ', action: ' + action : ''),
                  });
                });
              }
            }
          } catch (eC) { /* skip */ }

          // ---- Source 2: Recent drafts (last 10) ----
          try {
            if (typeof listPendingDrafts === 'function') {
              const drafts = listPendingDrafts(10);
              drafts.forEach(d => {
                events.push({
                  ts: d.date || new Date().toISOString(),
                  kind: 'draft_created',
                  summary: 'טיוטה: ' + (d.subject || '(ללא נושא)') + ' — ל ' + (d.to_email || d.to || ''),
                  details: (d.snippet || '').substring(0, 180),
                });
              });
            }
          } catch (eD) { /* skip */ }

          // ---- Source 3: Trigger / process markers ----
          const triggerProps = [
            ['LAST_PROCESS_RUN_AT', 'trigger_fired', 'processNewEmails הופעל'],
            ['LAST_TRIGGER_HEAL', 'trigger_fired', 'Trigger heal הופעל'],
            ['LAST_BULK_MOVE', 'process', 'העברת תיוג קבוצתית'],
            ['LAST_REVIEW_AT', 'process', 'Reviewer הופעל'],
            ['LAST_DRAFTS_AUDIO_REFRESH', 'process', 'אודיו טיוטות התרענן'],
            ['LAST_DAILY_DIGEST_AUDIO', 'process', 'תקציר יומי הועלה'],
          ];
          triggerProps.forEach(p => {
            const raw = props[p[0]];
            if (!raw) return;
            let ts = '';
            // Some are ISO strings, some are millisecond timestamps.
            if (/^\d{10,}$/.test(String(raw))) {
              ts = new Date(parseInt(raw, 10)).toISOString();
            } else {
              const parsed = Date.parse(String(raw));
              ts = parsed ? new Date(parsed).toISOString() : String(raw);
            }
            events.push({ ts: ts, kind: p[1], summary: p[2], details: p[0] + ' = ' + raw });
          });

          // ---- Source 4: Quota / breaker state ----
          let agentStatus = 'running';
          try {
            const trippedRaw = props.QUOTA_BREAKER_TRIPPED_UNTIL || '0';
            const tripped = parseInt(trippedRaw, 10) || 0;
            const nowMs = Date.now();
            if (tripped > nowMs && tripped < nowMs + 86400000) {
              agentStatus = 'quota_breaker';
              events.push({
                ts: new Date(nowMs).toISOString(),
                kind: 'error',
                summary: 'מכסת שליחה נחסמה עד ' + new Date(tripped).toISOString(),
                details: 'fails=' + (props.QUOTA_BREAKER_FAILS || '0'),
              });
            }
            const failCount = parseInt(props.QUOTA_BREAKER_FAILS || '0', 10);
            if (failCount > 0 && props.QUOTA_BREAKER_DATE) {
              events.push({
                ts: new Date().toISOString().substring(0, 10) === props.QUOTA_BREAKER_DATE
                    ? new Date().toISOString() : props.QUOTA_BREAKER_DATE,
                kind: 'error',
                summary: 'כשלי מכסה: ' + failCount,
                details: 'date=' + props.QUOTA_BREAKER_DATE,
              });
            }
          } catch (eQ) { /* skip */ }

          // ---- Source 5: Yemot processed count ----
          let yemotCount = 0;
          try {
            const processed = JSON.parse(props.YEMOT_PROCESSED_FILES || '[]');
            yemotCount = processed.length;
          } catch (eY) {}

          // De-duplicate (some sources may overlap on the same timestamp+summary)
          const seen = {};
          const dedup = [];
          events.forEach(ev => {
            const key = (ev.ts || '') + '|' + (ev.summary || '');
            if (seen[key]) return;
            seen[key] = 1;
            dedup.push(ev);
          });

          // Sort newest-first, cap to limit
          dedup.sort((a, b) => {
            const ta = Date.parse(a.ts || '') || 0;
            const tb = Date.parse(b.ts || '') || 0;
            return tb - ta;
          });
          const out = dedup.slice(0, limit);

          let mailRemaining = -1;
          try { mailRemaining = MailApp.getRemainingDailyQuota(); } catch (eM) {}

          return jsonOut({
            ok: true,
            now: new Date().toISOString(),
            events: out,
            agent_status: agentStatus,
            last_trigger_run: props.LAST_PROCESS_RUN_AT || null,
            last_trigger_heal: props.LAST_TRIGGER_HEAL || null,
            mail_remaining: mailRemaining,
            yemot_processed: yemotCount,
            event_count: out.length,
          });
        } catch (e) {
          return jsonOut({ ok: false, action: 'tail', error: e.message }, 500);
        }
      }

      // 2026-05-04 — Gmail Add-on (CardService sidebar) self-test.
      // Returns { ok, addon, version, handlers, backend_check } so the
      // operator can verify GmailAddon.gs deployed and all backend functions
      // it depends on are wired in (processNewEmails, approveDrafts, etc.).
      case 'addonStatus': {
        if (typeof addonStatus !== 'function') {
          return jsonOut({ ok: false, error: 'GmailAddon.gs not loaded' }, 500);
        }
        try {
          return jsonOut(Object.assign({ action: 'addonStatus' }, addonStatus()));
        } catch (e) {
          return jsonOut({ ok: false, action: 'addonStatus', error: e.message }, 500);
        }
      }

      case 'styleProfile': {
        // Mock style profile (no live email analysis — that crashed last
        // time). Returns the casual-style preferences hardcoded so the
        // caller / frontend can show "this is how Yosef writes".
        return jsonOut({
          ok: true,
          action: 'styleProfile',
          style: {
            length: 'very_short',
            greeting: 'rare',
            signoff: 'rare',
            uses_bsd: 'only_when_initiated',
            tone: 'direct_friendly',
          },
          notes: [
            'תשובות בנות 1-3 משפטים בדרך כלל',
            'בלי "בס"ד" אוטומטי — רק אם השולח פתח כך',
            'בלי "שלום [שם]" אוטומטי',
            'סגירה קצרה: "תודה" / "שכוייח" / כלום',
            'קיצורים: יש"כ, תזכיר, בערך, סבבה, טוב',
          ],
          updated_at: new Date().toISOString(),
        });
      }

      case 'nihul':
        // ניהול מוסדות — full webhook delegation. See NihulMosadot.gs
        return handleNihulMosadot(e);

      case 'yemotVoice':
        // 2026-05-17: Cloud failover voice agent. Yemot ext /6/6 calls this URL
        // after recording. Pipeline: download wav from Yemot → send to
        // Gemini multimodal → return reply text in id_list_message format.
        return handleYemotVoice_(params);

      case 'yemotBehaviorAddEvent':
        return handleYemotBehaviorAddEvent_(params);
      case 'yemotBehaviorRecent':
        return handleYemotBehaviorRecent_(params);
      case 'yemotBehaviorTasks':
        return handleYemotBehaviorTasks_(params);
      case 'yemotBehaviorPendingSigs':
        return handleYemotBehaviorPendingSigs_(params);
      case 'yemotBehaviorByStudent':
        return handleYemotBehaviorByStudent_(params);
      case 'yemotBehaviorCompleteTask':
        return handleYemotBehaviorCompleteTask_(params);
      case 'yemotMakeVideo':
        return handleYemotMakeVideo_(params);
      case 'videoQueueList': {
        if (params.token !== WEBHOOK_TOKEN) return jsonOut({ok:false}, 401);
        try {
          const sh = _bhtSheet_('video_queue');
          if (!sh) return jsonOut({ok:true, rows: []});
          const vals = sh.getDataRange().getValues();
          const rows = [];
          for (let i = 1; i < vals.length; i++) {
            if (vals[i][3] === 'pending') {
              rows.push({ index: i+1, ts: vals[i][0], phone: vals[i][1], prompt: vals[i][2] });
            }
          }
          return jsonOut({ok:true, rows});
        } catch (e) { return jsonOut({ok:false, error: e.message}, 500); }
      }
      case 'videoQueueUpdate': {
        if (params.token !== WEBHOOK_TOKEN) return jsonOut({ok:false}, 401);
        try {
          const sh = _bhtSheet_('video_queue');
          if (!sh) return jsonOut({ok:false, error:'no sheet'}, 404);
          const row = parseInt(params.rowIndex);
          if (!row) return jsonOut({ok:false}, 400);
          sh.getRange(row, 4).setValue(params.status || 'unknown');
          if (params.videoUrl) sh.getRange(row, 5).setValue(params.videoUrl);
          if (params.error) sh.getRange(row, 6).setValue(params.error);
          return jsonOut({ok:true});
        } catch (e) { return jsonOut({ok:false, error: e.message}, 500); }
      }
      case 'fmListLinks': {
        if (params.token !== WEBHOOK_TOKEN) return jsonOut({ok:false}, 401);
        try {
          const props = PropertiesService.getScriptProperties();
          const tokens = JSON.parse(props.getProperty('PARENT_FORM_TOKENS') || '{}');
          const subs = JSON.parse(props.getProperty('PARENT_FORM_SUBMISSIONS') || '[]');
          const links = Object.entries(tokens).map(([lt, t]) => ({
            lt, tpl: t.tpl||'', ref: t.ref||'',
            createdAt: t.createdAt || 0,
            viewed: !!t.viewed, viewedAt: t.viewedAt || 0,
            used: !!t.used, usedAt: t.usedAt || 0,
            broadcast: !!t.broadcast,
            studentName: t.studentName || '',
          }));
          return jsonOut({ok:true, links, submissions: subs});
        } catch (e) { return jsonOut({ok:false, error: e.message}, 500); }
      }
      case 'fmDeleteLink': {
        if (params.token !== WEBHOOK_TOKEN) return jsonOut({ok:false}, 401);
        try {
          const props = PropertiesService.getScriptProperties();
          const tokens = JSON.parse(props.getProperty('PARENT_FORM_TOKENS') || '{}');
          delete tokens[params.lt];
          props.setProperty('PARENT_FORM_TOKENS', JSON.stringify(tokens));
          return jsonOut({ok:true});
        } catch (e) { return jsonOut({ok:false, error: e.message}, 500); }
      }
      case 'fmTrackView': {
        // Called by parent-signature when a link is opened
        try {
          const props = PropertiesService.getScriptProperties();
          const tokens = JSON.parse(props.getProperty('PARENT_FORM_TOKENS') || '{}');
          if (tokens[params.lt] && !tokens[params.lt].viewed) {
            tokens[params.lt].viewed = true;
            tokens[params.lt].viewedAt = Date.now();
            props.setProperty('PARENT_FORM_TOKENS', JSON.stringify(tokens));
          }
          return jsonOut({ok:true});
        } catch (e) { return jsonOut({ok:false}, 500); }
      }
      case 'fmZipSubmissions': {
        if (params.token !== WEBHOOK_TOKEN) return jsonOut({ok:false}, 401);
        try {
          const folder = DriveApp.getFoldersByName('אישורי הורים');
          if (!folder.hasNext()) return jsonOut({ok:false, error:'no folder'}, 404);
          // Use Drive's "make zip" via createFile on getBlob isn't trivial in Apps Script.
          // Instead, return link to the folder itself for the user to download manually.
          const fld = folder.next();
          try { fld.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(_) {}
          return jsonOut({ok:true, url: fld.getUrl(), note: 'תיקיית כל הטפסים החתומים - הורד מהDrive ידנית'});
        } catch (e) { return jsonOut({ok:false, error: e.message}, 500); }
      }
      case 'fetchVeoVideo': {
        // Download Veo video, save to Drive AND return base64 inline (bypass NetFree completely)
        if (params.token !== WEBHOOK_TOKEN) return jsonOut({ok:false}, 401);
        try {
          const uri = params.uri;
          const key = params.apiKey || 'AIzaSyBnQLFAQcQOl2A_iIlyfY1NFgGgCRyIHr8';
          const filename = params.filename || ('veo_'+Date.now()+'.mp4');
          const inline = params.inline === '1' || params.inline === true;
          const full = uri + (uri.indexOf('?') >= 0 ? '&' : '?') + 'key=' + encodeURIComponent(key);
          const resp = UrlFetchApp.fetch(full, { muteHttpExceptions: true });
          if (resp.getResponseCode() !== 200) {
            return jsonOut({ok:false, error: 'veo fetch '+resp.getResponseCode()}, 500);
          }
          const bytes = resp.getBlob().getBytes();
          const blob = Utilities.newBlob(bytes, 'video/mp4', filename);
          const folder = (function() {
            const it = DriveApp.getFoldersByName('סרטוני AI');
            return it.hasNext() ? it.next() : DriveApp.createFolder('סרטוני AI');
          })();
          const file = folder.createFile(blob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          const result = {ok:true, url: file.getUrl(), id: file.getId(), bytes: bytes.length};
          if (inline && bytes.length < 5*1024*1024) {
            // Return base64 for small files (under 5MB) - bypass NetFree fully
            result.b64 = Utilities.base64Encode(bytes);
          }
          return jsonOut(result);
        } catch (e) { return jsonOut({ok:false, error: e.message}, 500); }
      }
      case 'uploadVideoToDrive': {
        if (params.token !== WEBHOOK_TOKEN) return jsonOut({ok:false}, 401);
        try {
          const b64 = params.b64;
          const filename = params.filename || ('video_' + Date.now() + '.mp4');
          const bytes = Utilities.base64Decode(b64);
          const blob = Utilities.newBlob(bytes, 'video/mp4', filename);
          const folder = (function() {
            const it = DriveApp.getFoldersByName('סרטוני AI');
            return it.hasNext() ? it.next() : DriveApp.createFolder('סרטוני AI');
          })();
          const file = folder.createFile(blob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          return jsonOut({ok:true, url: file.getUrl(), id: file.getId()});
        } catch (e) { return jsonOut({ok:false, error: e.message}, 500); }
      }
      case 'bhtCounts': {
        // Returns counts for FAB badges in the extension
        if (params.token !== WEBHOOK_TOKEN) return jsonOut({ok:false}, 401);
        try {
          const events = _bhtAllRows_('מעקב_התנהגות');
          const tasks = _bhtAllRows_('משימות');
          const sigs = _bhtAllRows_('חתימות');
          return jsonOut({
            ok: true,
            pendingEvents: events.filter(e => e['סטטוס_אישור'] === 'ממתין לאישור').length,
            overdueTasks: tasks.filter(t => t['סטטוס'] !== 'הושלם' && t['תאריך_יעד'] && new Date(t['תאריך_יעד']) < new Date()).length,
            pendingSigs: sigs.filter(s => s['סטטוס'] === 'מחכה').length,
          });
        } catch (e) {
          return jsonOut({ok:false, error: e.message}, 500);
        }
      }

      case 'setYemotToken': {
        // 2026-05-21: PC pushes fresh Yemot login token here every 30min.
        // Apps Script IPs are blocked from Yemot Login API ("account lock").
        if (params.token !== WEBHOOK_TOKEN) {
          return jsonOut({ok: false, error: 'auth'}, 401);
        }
        const yt = params.yemotToken || '';
        if (!yt || yt.length < 10) {
          return jsonOut({ok: false, error: 'bad token'}, 400);
        }
        PropertiesService.getScriptProperties().setProperty('YEMOT_TOKEN_LIVE', yt);
        return jsonOut({ok: true, len: yt.length});
      }

      default:
        return jsonOut({ ok: false, error: 'unknown action: ' + action }, 400);
    }
  } catch (err) {
    // Round 5 fix: redact tokens / secrets from stack trace before logging
    // OR returning to the caller. The webhook response was previously leaking
    // raw stack traces (which sometimes contain hard-coded credentials from
    // Config.gs or the live PropertyService values). Stack stays in console
    // log redacted for debugging; the HTTP response no longer includes it.
    const redactedStack = redactSecrets(String(err.stack || '')).substring(0, 1500);
    console.error('Webhook error: ' + redactedStack);
    if (action === 'dashboard') {
      return htmlAuthError_('שגיאה: ' + redactSecrets(err.message || 'internal'));
    }
    return jsonOut({ ok: false, error: redactSecrets(err.message || 'internal') }, 500);
  }
}

// ============================================
// Yemot voice agent — cloud failover (/8)
// ============================================
//
// Yemot Studio /8 config (set ext.ini there):
//   type=record
//   record_max_seconds=60
//   record_end_action=api_call
//   api_call_url=https://script.google.com/macros/s/<DEPLOY_ID>/exec?action=yemotVoice&token=BHT_AGENT_2026
//
// Yemot will POST the call params (ApiCallId, ApiPhone, ApiYFsItemId, etc.)
// and we have ~30s to reply. We return Yemot's plain-text response format:
//   id_list_message=t-<text>.&hangup=yes
// or with a loop-back instead of hangup.

function handleYemotVoice_echo(params) {
  // Old echo test mode (2026-05-17). Kept for debug. Not wired.
  try {
    const keys = Object.keys(params || {});
    const dump = keys.map(k => k + '=' + String(params[k]).slice(0, 60)).join(' || ');
    logYemotCall_('echo', dump);
    const sample = keys.slice(0, 5).map(k => k + '=' + String(params[k]).slice(0, 25)).join(' ');
    return yemotText_('בדיקה הצליחה. ' + keys.length + ' פרמטרים. ' + sample);
  } catch (err) {
    return yemotText_('שגיאה: ' + (err.message || err).toString().slice(0, 200));
  }
}

function logYemotCall_(kind, info) {
  try {
    const folderName = 'YemotVoiceLogs';
    const it = DriveApp.getFoldersByName(folderName);
    const folder = it.hasNext() ? it.next() : DriveApp.createFolder(folderName);
    const name = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM-dd') + '.log';
    let file = null;
    const fit = folder.getFilesByName(name);
    if (fit.hasNext()) file = fit.next();
    const ts = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'HH:mm:ss');
    const line = '[' + ts + '] ' + kind + ' ' + info + '\n';
    if (file) file.setContent(file.getBlob().getDataAsString() + line);
    else folder.createFile(name, line);
  } catch (e) { /* ignore log failures */ }
}

function handleYemotVoice_(params) {
  const t0 = Date.now();
  // 2026-05-21: minimal logging — only failures — to stay under Yemot 20s timeout.
  let recPath = params.voiceRecord || params.ApiYFsItemId || params.ApiFsId || params.recording || '';
  if (!recPath) {
    return yemotText_('לא הגיעה הקלטה. נסה שוב.');
  }
  if (!recPath.startsWith('ivr2:')) {
    if (recPath.startsWith('/')) recPath = 'ivr2:' + recPath;
    else recPath = 'ivr2:/6/6/recs/' + recPath;
  }

  try {
    let audioBlob;
    try {
      audioBlob = downloadYemotFile_(recPath);
    } catch (downErr) {
      logYemotCall_('download-exc', String(downErr).substring(0, 200));
      return yemotText_('שגיאת הורדה');
    }
    const sz = audioBlob ? audioBlob.getBytes().length : 0;
    if (sz < 1000) {
      return yemotText_('הקלטה ריקה');
    }

    const audioB64 = Utilities.base64Encode(audioBlob.getBytes());

    // 2) Send audio to Gemini 2.5 Flash. Native multimodal — understands the
    // audio and replies in Hebrew text in one call. Key from Script Properties
    // (fallback to hardcoded). Whitelist already has generativelanguage.googleapis.com.
    const props = PropertiesService.getScriptProperties();
    const apiKey = props.getProperty('GEMINI_API_KEY_FAILOVER') ||
                   'AIzaSyBnQLFAQcQOl2A_iIlyfY1NFgGgCRyIHr8';
    const payload = {
      systemInstruction: {
        parts: [{ text:
          'ענה בעברית קצרה (1-3 משפטים), זורמת להקראה קולית. בלי JSON/markdown/רשימות.'
        }]
      },
      contents: [{
        role: 'user',
        parts: [{ inline_data: { mime_type: 'audio/wav', data: audioB64 } }]
      }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 400 }
    };

    const resp = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      }
    );

    let code = resp.getResponseCode();
    let respText = resp.getContentText();
    // Retry once on 5xx (Gemini server overload — common during peak hours)
    if (code >= 500 && code < 600) {
      Utilities.sleep(800);
      const resp2 = UrlFetchApp.fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
        { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true }
      );
      code = resp2.getResponseCode();
      respText = resp2.getContentText();
    }
    if (code !== 200) {
      logYemotCall_('gemini-err', code + ': ' + respText.substring(0, 200));
      return yemotText_('הענן עמוס כרגע. נסה שוב בעוד דקה.');
    }

    const data = JSON.parse(respText);
    let replyText = (
      data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text
    ) || '';
    replyText = String(replyText).trim();
    if (!replyText) {
      return yemotText_('לא הצלחתי להבין את ההקלטה');
    }
    // Log only the ok event (cheap async-ish) for monitoring elapsed times
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    try { logYemotCall_('ok', elapsed + 's ' + replyText.substring(0,60)); } catch (_) {}
    return yemotText_(replyText);
  } catch (err) {
    logYemotCall_('exc', String(err).substring(0, 200));
    return yemotText_('שגיאה כללית');
  }
}

function downloadYemotFile_(yfsPath) {
  // 2026-05-21: Apps Script IPs are blocked by Yemot Login API ("account lock").
  // Solution: PC pushes fresh token to Script Properties every 30min via
  // setYemotToken action. We use that token here.
  const props = PropertiesService.getScriptProperties();
  const tok = props.getProperty('YEMOT_TOKEN_LIVE');
  if (!tok) {
    throw new Error('no token. run PC sync_yemot_token.py first');
  }
  const url = 'https://www.call2all.co.il/ym/api/DownloadFile?token=' +
    encodeURIComponent(tok) + '&path=' + encodeURIComponent(yfsPath);
  const fileResp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const sz = fileResp.getBlob().getBytes().length;
  if (fileResp.getResponseCode() === 200 && sz >= 1000) {
    return fileResp.getBlob();
  }
  throw new Error('code=' + fileResp.getResponseCode() + ' size=' + sz +
                  ' body=' + fileResp.getContentText().substring(0, 100));
}

// === Behavior tracking phone line (ext /8) — added 2026-05-21 ===

const BHT_SHEET_ID = '1-GFdXr0diOlof-mMAp2Qci0fVjq0QHf21rv3FNFHQOs';

function _bhtSheet_(name) {
  try {
    const ss = SpreadsheetApp.openById(BHT_SHEET_ID);
    return ss.getSheetByName(name);
  } catch (e) {
    return null;
  }
}

function _bhtAllRows_(sheetName) {
  const sh = _bhtSheet_(sheetName);
  if (!sh) return [];
  const vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];
  const headers = vals[0];
  return vals.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function _bhtPhoneToReporter_(phone) {
  // Resolve caller phone → reporter username from משתמשים sheet (טלפון column)
  if (!phone) return 'phone';
  const users = _bhtAllRows_('משתמשים');
  const normalized = String(phone).replace(/[^0-9]/g, '');
  const hit = users.find(u => {
    const p = String(u['טלפון']||'').replace(/[^0-9]/g, '');
    return p && (normalized.endsWith(p) || p.endsWith(normalized));
  });
  return hit ? (hit['שם משתמש']||hit['שם']||'phone') : ('phone-' + normalized.slice(-4));
}

function handleYemotBehaviorAddEvent_(params) {
  try {
    const studentDigits = (params.studentDigits || '').toString().trim();
    const audioRef = params.audioRec || '';
    const callerPhone = params.ApiPhone || '';
    const reporter = _bhtPhoneToReporter_(callerPhone);
    const allStudents = _bhtAllRows_('תלמידים');

    let stu = null;
    if (studentDigits && studentDigits.length >= 2) {
      stu = allStudents.find(s => String(s['מזהה']).endsWith(studentDigits));
    }

    // Transcribe + classify via Gemini
    let recPath = audioRef.startsWith('ivr2:') ? audioRef : 'ivr2:' + (audioRef.startsWith('/') ? audioRef : '/8/1/recs/' + audioRef);
    let transcript = '';
    let category = 'התנהגות';
    let severity = 'בינונית';
    let detectedStudent = null;
    try {
      const blob = downloadYemotFile_(recPath);
      if (blob && blob.getBytes().length > 1000) {
        const props = PropertiesService.getScriptProperties();
        const apiKey = props.getProperty('GEMINI_API_KEY_FAILOVER') || 'AIzaSyBnQLFAQcQOl2A_iIlyfY1NFgGgCRyIHr8';
        const audioB64 = Utilities.base64Encode(blob.getBytes());
        // Build a compact student-name list for Gemini to match against
        const stuList = allStudents.slice(0, 100).map(s => `${s['מזהה']}=${s['שם פרטי']||''} ${s['שם משפחה']||''}`).join('; ');
        const sysPrompt = 'אתה מסווג אירועי התנהגות בחיידר. מההקלטה החזר JSON בלבד עם:\n' +
          'transcript: תמלול מלא של מה שנאמר.\n' +
          'student_id: המזהה של התלמיד שמוזכר (אם הוא ברשימה למטה, אחרת 0).\n' +
          'category: קטגוריה (התנהגות / דרך ארץ / לימודים / אלימות / שיעור פרטני / חיוב / חיובי / אחר).\n' +
          'severity: חומרה (נמוכה / בינונית / גבוהה).\n' +
          'רשימת תלמידים: ' + stuList;
        const payload = {
          systemInstruction: { parts: [{ text: sysPrompt }] },
          contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'audio/wav', data: audioB64 } }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 800, responseMimeType: 'application/json' },
        };
        const resp = UrlFetchApp.fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
          { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true }
        );
        if (resp.getResponseCode() === 200) {
          const d = JSON.parse(resp.getContentText());
          const txt = ((d.candidates||[])[0]?.content?.parts?.[0]?.text || '').trim();
          try {
            const j = JSON.parse(txt);
            transcript = String(j.transcript||'').trim();
            if (j.student_id) detectedStudent = allStudents.find(s => String(s['מזהה']) === String(j.student_id));
            if (j.category) category = String(j.category);
            if (j.severity) severity = String(j.severity);
          } catch (_) { transcript = txt; }
        }
      }
    } catch (e) { transcript = '(תמלול נכשל: ' + e.message + ')'; }
    if (!transcript) transcript = '(הקלטה ללא תמלול)';
    if (!stu && detectedStudent) stu = detectedStudent;

    // Append to מעקב_התנהגות sheet (status=ממתין לאישור so it shows in approval UI)
    const sh = _bhtSheet_('מעקב_התנהגות');
    if (!sh) return yemotText_('הגיליון מעקב התנהגות לא נמצא');
    const newId = Date.now();
    const stuName = stu ? `${stu['שם פרטי']||''} ${stu['שם משפחה']||''}`.trim() : '(לא זוהה תלמיד)';
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const obj = {
      'מזהה': newId, 'תלמיד_מזהה': stu ? stu['מזהה'] : '', 'שם תלמיד': stuName,
      'תאריך': new Date(), 'קטגוריה': category, 'תיאור': transcript,
      'חומרה': severity, 'דווח_עי': reporter,
      'סטטוס_אישור': 'ממתין לאישור', 'מקור': 'phone-/8',
    };
    sh.appendRow(headers.map(h => obj[h] !== undefined ? obj[h] : ''));
    return yemotText_(`אירוע נשמר ל${stuName}. קטגוריה ${category}, חומרה ${severity}. ממתין לאישורך באתר.`);
  } catch (e) {
    return yemotText_('שגיאה: ' + (e.message||e).toString().slice(0,100));
  }
}

function handleYemotBehaviorRecent_(params) {
  try {
    const events = _bhtAllRows_('מעקב_התנהגות');
    if (!events.length) return yemotText_('אין אירועי התנהגות');
    const sorted = events.sort((a, b) => new Date(b['תאריך']||0) - new Date(a['תאריך']||0)).slice(0, 5);
    const parts = sorted.map((e, i) => {
      const d = e['תאריך'] ? new Date(e['תאריך']) : null;
      const when = d ? `${d.getDate()} בחודש ${d.getMonth()+1}` : '';
      return `${i+1}. ${when}. ${e['שם תלמיד']||''}. ${e['קטגוריה']||''}. ${String(e['תיאור']||'').slice(0,80)}`;
    });
    return yemotText_('חמשת האירועים האחרונים. ' + parts.join('. '));
  } catch (e) {
    return yemotText_('שגיאה בקריאת אירועים');
  }
}

function handleYemotBehaviorTasks_(params) {
  try {
    const tasks = _bhtAllRows_('משימות').filter(t => t['סטטוס'] !== 'הושלם');
    if (!tasks.length) return yemotText_('אין משימות פתוחות');
    const top = tasks.slice(0, 5);
    const parts = top.map((t, i) => {
      const due = t['תאריך_יעד'] ? new Date(t['תאריך_יעד']) : null;
      const overdue = due && due < new Date();
      const dueText = due ? `יעד ${due.getDate()} בחודש ${due.getMonth()+1}` : '';
      return `${i+1}. ${t['כותרת']||'-'}. ${dueText}${overdue?' פג תוקף':''}.`;
    });
    return yemotText_(`${tasks.length} משימות פתוחות. ראשונות. ` + parts.join(' '));
  } catch (e) {
    return yemotText_('שגיאה בקריאת משימות');
  }
}

function handleYemotMakeVideo_(params) {
  try {
    const audioRef = params.videoPrompt || '';
    const phone = params.ApiPhone || '';
    const recPath = audioRef.startsWith('ivr2:') ? audioRef : 'ivr2:' + (audioRef.startsWith('/') ? audioRef : '/8/7/recs/' + audioRef);
    // 1) Transcribe with Gemini
    let prompt = '';
    try {
      const blob = downloadYemotFile_(recPath);
      if (blob && blob.getBytes().length > 1000) {
        const props = PropertiesService.getScriptProperties();
        const apiKey = props.getProperty('GEMINI_API_KEY_FAILOVER') || 'AIzaSyBnQLFAQcQOl2A_iIlyfY1NFgGgCRyIHr8';
        const audioB64 = Utilities.base64Encode(blob.getBytes());
        const payload = {
          systemInstruction: { parts: [{ text: 'תמלל את האודיו במדויק. החזר רק את הטקסט המתומלל בלי הקדמה.' }] },
          contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'audio/wav', data: audioB64 } }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 400 },
        };
        const resp = UrlFetchApp.fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
          { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true }
        );
        if (resp.getResponseCode() === 200) {
          const d = JSON.parse(resp.getContentText());
          prompt = ((d.candidates||[])[0]?.content?.parts?.[0]?.text || '').trim();
        }
      }
    } catch (e) {
      return yemotText_('שגיאת תמלול: ' + e.message.substring(0, 60));
    }
    if (!prompt) return yemotText_('לא הצלחתי להבין את הבקשה. נסה שוב ברור יותר.');
    // 2) Trigger Veo generation (async - return immediately, send WhatsApp later)
    // Save the prompt + phone to a "video queue" sheet for a background runner
    const sh = _bhtSheet_('video_queue') || (function() {
      const ss = SpreadsheetApp.openById(BHT_SHEET_ID);
      const newSh = ss.insertSheet('video_queue');
      newSh.getRange(1,1,1,6).setValues([['ts','phone','prompt','status','video_url','error']]).setFontWeight('bold');
      return newSh;
    })();
    sh.appendRow([new Date(), phone, prompt, 'pending', '', '']);
    return yemotText_(`קיבלתי. יוצר סרטון בנושא: ${prompt.substring(0,80)}. הסרטון יישלח אליך כשיהיה מוכן, תוך כמה דקות.`);
  } catch (e) {
    return yemotText_('שגיאה: ' + e.message.substring(0, 80));
  }
}

function handleYemotBehaviorCompleteTask_(params) {
  try {
    const digits = (params.taskDigits || '').toString().trim();
    if (!digits) return yemotText_('מספר משימה לא תקין');
    const sh = _bhtSheet_('משימות');
    if (!sh) return yemotText_('גיליון משימות לא נמצא');
    const all = _bhtAllRows_('משימות');
    const task = all.find(t => String(t['מזהה']).endsWith(digits) && t['סטטוס'] !== 'הושלם');
    if (!task) return yemotText_('משימה לא נמצאה או כבר הושלמה');
    // Update row
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const idCol = headers.indexOf('מזהה') + 1;
    const statusCol = headers.indexOf('סטטוס') + 1;
    const doneCol = headers.indexOf('תאריך_השלמה') + 1;
    if (!idCol || !statusCol) return yemotText_('מבנה גיליון לא תקין');
    const data = sh.getRange(2, idCol, sh.getLastRow()-1, 1).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]) === String(task['מזהה'])) {
        sh.getRange(i + 2, statusCol).setValue('הושלם');
        if (doneCol > 0) sh.getRange(i + 2, doneCol).setValue(new Date());
        return yemotText_(`משימה ${task['כותרת']||''} סומנה כהושלמה.`);
      }
    }
    return yemotText_('שגיאה בעדכון');
  } catch (e) {
    return yemotText_('שגיאה: ' + e.message.substring(0, 80));
  }
}

function handleYemotBehaviorByStudent_(params) {
  try {
    const digits = (params.studentDigits || '').toString().trim();
    if (!digits || digits.length < 2) return yemotText_('מספר לא תקין');
    const students = _bhtAllRows_('תלמידים');
    const stu = students.find(s => String(s['מזהה']).endsWith(digits));
    if (!stu) return yemotText_('תלמיד לא נמצא');
    const events = _bhtAllRows_('מעקב_התנהגות').filter(e => String(e['תלמיד_מזהה']) === String(stu['מזהה']));
    if (!events.length) return yemotText_(`לתלמיד ${stu['שם פרטי']||''} ${stu['שם משפחה']||''} אין אירועים מתועדים.`);
    const sorted = events.sort((a,b) => new Date(b['תאריך']||0) - new Date(a['תאריך']||0)).slice(0, 5);
    const parts = sorted.map((e, i) => {
      const d = e['תאריך'] ? new Date(e['תאריך']) : null;
      const when = d ? `${d.getDate()} בחודש ${d.getMonth()+1}` : '';
      return `${i+1}. ${when}. ${e['קטגוריה']||''}. ${String(e['תיאור']||'').slice(0,60)}`;
    });
    return yemotText_(`${stu['שם פרטי']||''} ${stu['שם משפחה']||''}, ${events.length} אירועים סך הכל. אחרונים: ` + parts.join('. '));
  } catch (e) {
    return yemotText_('שגיאה: ' + e.message.substring(0, 80));
  }
}

function handleYemotBehaviorPendingSigs_(params) {
  try {
    const sigs = _bhtAllRows_('חתימות').filter(s => s['סטטוס'] === 'מחכה');
    if (!sigs.length) return yemotText_('אין חתימות בהמתנה');
    const top = sigs.slice(0, 5);
    const parts = top.map((s, i) => {
      const d = s['תאריך'] ? new Date(s['תאריך']) : null;
      const when = d ? `${d.getDate()} בחודש ${d.getMonth()+1}` : '';
      return `${i+1}. ${when}. ${s['סוג']||''}. ${s['תיאור']?String(s['תיאור']).slice(0,50):''}`;
    });
    return yemotText_(`${sigs.length} חתימות ממתינות. ` + parts.join('. '));
  } catch (e) {
    return yemotText_('שגיאה בקריאת חתימות');
  }
}

function yemotText_(text) {
  // Yemot api_call response format. Sanitize & + = (params separators) and
  // collapse whitespace; cap length so the TTS doesn't run too long.
  const safe = String(text)
    .replace(/[&=]/g, ' ')
    .replace(/[\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800);
  // hangup after speaking; user can call back to loop.
  const body = 'id_list_message=t-' + safe + '&hangup=yes';
  return ContentService.createTextOutput(body)
    .setMimeType(ContentService.MimeType.TEXT);
}

// HTML-friendly error page for the dashboard action (auth/load failures).
function htmlAuthError_(msg) {
  const safe = String(msg || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const html = '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">' +
    '<title>לוח בקרה</title>' +
    '<style>body{font-family:Arial,sans-serif;background:#f5f7fb;color:#202124;padding:48px;text-align:center}' +
    '.box{max-width:480px;margin:auto;background:#fff;padding:32px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}' +
    'h1{color:#ea4335;font-size:22px;margin-bottom:12px}p{color:#5f6368}</style>' +
    '</head><body><div class="box"><h1>לא ניתן להציג את הלוח</h1><p>' + safe + '</p></div></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle('לוח בקרה — שגיאה')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function webhookDiagnose() {
  const triggers = ScriptApp.getProjectTriggers().map(t => ({
    handler: t.getHandlerFunction(),
    source: String(t.getTriggerSource()),
    uid: t.getUniqueId(),
  }));

  const props = PropertiesService.getScriptProperties().getProperties();
  const propsSummary = {
    has_GH_TOKEN: !!props.GH_TOKEN,
    has_MEMORY_SHEET_ID: !!props.MEMORY_SHEET_ID,
    has_AGENT_ROOT_FOLDER_ID: !!props.AGENT_ROOT_FOLDER_ID,
    has_CLAUDE_ACCESS_TOKEN: !!props.CLAUDE_ACCESS_TOKEN,
    LAST_REVIEW_AT: props.LAST_REVIEW_AT || null,
    LAST_BULK_MOVE: props.LAST_BULK_MOVE || null,
    PROCESSED_COUNT: (function () {
      try { return JSON.parse(props.PROCESSED_MSG_IDS || '[]').length; } catch (e) { return -1; }
    })(),
    AGENT_SENT_COUNT: (function () {
      try { return JSON.parse(props.AGENT_SENT_MSG_IDS || '[]').length; } catch (e) { return -1; }
    })(),
    // Round 1-5 marathon 2026-05-04: surface real breaker state in diagnose
    quota_breaker_until: (function () {
      const raw = props.QUOTA_BREAKER_TRIPPED_UNTIL || '0';
      const t = parseInt(raw, 10) || 0;
      if (t > Date.now() && t < Date.now() + 24 * 60 * 60 * 1000) {
        return new Date(t).toISOString();
      }
      return null;
    })(),
    quota_breaker_fails: parseInt(props.QUOTA_BREAKER_FAILS || '0', 10),
    quota_breaker_date: props.QUOTA_BREAKER_DATE || null,
  };

  // Last 5 conversations
  let lastConvs = [];
  try {
    const ss = getMemorySheet();
    const sh = ss.getSheetByName(MEM_SHEETS.CONVERSATIONS);
    const data = sh.getDataRange().getValues();
    lastConvs = data.slice(Math.max(1, data.length - 5)).map(r => ({
      sender: r[1], action: r[2], summary: r[3], date: r[4],
    }));
  } catch (e) { /* ignore */ }

  // Last unread / errored AI threads
  let errCount = 0, doneCount = 0, draftCount = 0;
  try {
    const errL = GmailApp.getUserLabelByName(CONFIG.LABEL_ERROR);
    if (errL) errCount = errL.getThreads(0, 50).length;
    const doneL = GmailApp.getUserLabelByName(CONFIG.LABEL_DONE);
    if (doneL) doneCount = doneL.getThreads(0, 1).length === 1 ? doneL.getThreads(0, 50).length : 0;
    const drL = GmailApp.getUserLabelByName(CONFIG.LABEL_DRAFT);
    if (drL) draftCount = drL.getThreads(0, 50).length;
  } catch (e) {}

  // Quick LLM probe
  let llmProbe = null;
  try {
    const txt = llmText('החזר את המילה: בסדר');
    llmProbe = { ok: !!txt, sample: (txt || '').substring(0, 80) };
  } catch (e) {
    llmProbe = { ok: false, error: e.message };
  }

  return {
    ok: true,
    user: getUserPrimaryEmail(),
    plus: getPlusAddress(),
    triggers,
    triggers_count: triggers.length,
    props: propsSummary,
    labels: { error: errCount, done: doneCount, draft: draftCount },
    last_conversations: lastConvs,
    llm_probe: llmProbe,
    time: new Date().toISOString(),
  };
}

function jsonOut(obj, code) {
  // Apps Script HtmlService can't set status — we rely on JSON body. Code is informational.
  obj._http = code || 200;
  return ContentService.createTextOutput(JSON.stringify(obj, null, 2)).setMimeType(ContentService.MimeType.JSON);
}

// Round 5 helper: constant-time string comparison so the auth check doesn't
// leak how many leading bytes of WEBHOOK_TOKEN match. Apps Script latency
// dwarfs CPU timing, but cleaner discipline.
function safeTokenEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// Round 5 helper: redact secret-like substrings from any string before we
// log or echo it. Anything that looks like a JWT, GitHub token, Anthropic
// OAuth token, or AKfyc... script URL gets reduced to a fixed marker.
function redactSecrets(s) {
  if (!s) return s;
  return String(s)
    .replace(/sk-ant-(?:oat|ort)\d+-[A-Za-z0-9_\-]{20,}/g, 'sk-ant-***')
    .replace(/gh[opsu]_[A-Za-z0-9]{20,}/g, 'gh*_***')
    .replace(/AKfycb[A-Za-z0-9_\-]{40,}/g, 'AKfyc***')
    .replace(/eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, 'jwt-***')
    .replace(/AIza[A-Za-z0-9_\-]{20,}/g, 'AIza***');
}

// ============================================================
// TRASH RESTORE — video files only, no content reading
// Two actions: list (preview) + restore (move out of trash into a dated folder).
// adminGate via WEBHOOK_TOKEN (which is what the caller will pass).
// ============================================================
function _isVideoFile_(file) {
  try {
    const mt = (file.getMimeType() || '').toLowerCase();
    if (mt.indexOf('video/') === 0) return true;
    const name = (file.getName() || '').toLowerCase();
    return /\.(mp4|mov|avi|mkv|webm|wmv|m4v|3gp|mpg|mpeg|flv|ts|m2ts|mts)$/.test(name);
  } catch (e) { return false; }
}

function actionListTrashedVideos(params) {
  if (params.token !== WEBHOOK_TOKEN && !hasValidSession_(params)) {
    return { ok: false, error: 'unauthorized' };
  }
  const limit = Math.min(parseInt(params.limit || '200', 10), 1000);
  const out = [];
  let scanned = 0;
  try {
    const it = DriveApp.searchFiles('trashed=true');
    while (it.hasNext() && out.length < limit) {
      const f = it.next();
      scanned++;
      if (!_isVideoFile_(f)) continue;
      out.push({
        id: f.getId(),
        name: f.getName(),
        mimeType: f.getMimeType(),
        size: f.getSize(),
        modified: f.getLastUpdated().toISOString()
      });
    }
  } catch (e) {
    return { ok: false, error: 'scan failed: ' + e.message, scanned: scanned, found: out.length, sample: out };
  }
  return { ok: true, scanned: scanned, found: out.length, files: out };
}

function actionRestoreTrashedVideos(params) {
  if (params.token !== WEBHOOK_TOKEN && !hasValidSession_(params)) {
    return { ok: false, error: 'unauthorized' };
  }
  const dryRun = params.dryRun === '1' || params.dryRun === true || params.dry === '1';
  const limit = Math.min(parseInt(params.limit || '500', 10), 2000);
  // Target folder name (auto-created at Drive root): "וידיאו_משוחזר_YYYY-MM-DD"
  const tag = params.folderTag || new Date().toISOString().slice(0, 10);
  const folderName = params.folder || ('וידיאו_משוחזר_' + tag);
  let targetFolder = null;
  if (!dryRun) {
    const it = DriveApp.getRootFolder().getFoldersByName(folderName);
    targetFolder = it.hasNext() ? it.next() : DriveApp.createFolder(folderName);
  }
  let scanned = 0, restored = 0, skipped = 0, failed = 0;
  const restoredList = [];
  const errors = [];
  try {
    const it = DriveApp.searchFiles('trashed=true');
    while (it.hasNext() && (restored + skipped) < limit) {
      const f = it.next();
      scanned++;
      if (!_isVideoFile_(f)) { skipped++; continue; }
      const meta = { id: f.getId(), name: f.getName(), size: f.getSize() };
      if (dryRun) { restoredList.push(meta); restored++; continue; }
      try {
        f.setTrashed(false);
        targetFolder.addFile(f);
        restoredList.push(meta);
        restored++;
      } catch (e) {
        failed++;
        if (errors.length < 10) errors.push(meta.name + ': ' + e.message);
      }
    }
  } catch (e) {
    return { ok: false, error: 'scan failed: ' + e.message, scanned: scanned, restored: restored, failed: failed, errors: errors };
  }
  return {
    ok: true,
    dryRun: dryRun,
    folder: folderName,
    folderId: targetFolder ? targetFolder.getId() : null,
    folderUrl: targetFolder ? targetFolder.getUrl() : null,
    scanned: scanned,
    restored: restored,
    skipped_non_video: skipped,
    failed: failed,
    files: restoredList,
    errors: errors
  };
}
