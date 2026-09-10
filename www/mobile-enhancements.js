'use strict';
(function () {
  const $ = id => document.getElementById(id);

  function removeNativeFeatureCopies() {
    const operationalScreens = [
      'jobsScreen',
      'customersScreen',
      'paymentsScreen',
      'teamScreen',
      'detailScreen'
    ];
    operationalScreens.forEach(id => {
      const screen = $(id);
      if (!screen) return;
      screen.querySelectorAll('.detail-card, .card, .notice').forEach(card => {
        const heading = card.querySelector('.section-title, h2, h3');
        const text = (heading?.textContent || '').trim().toLowerCase();
        if (text === 'native features' || text === 'device features') card.remove();
      });
    });
  }

  function ensureArchiveControl() {
    const root = $('detailContent');
    if (!root || root.querySelector('#archiveJobBtn') || !currentJobId) return;

    const card = document.createElement('div');
    card.className = 'detail-card';
    card.id = 'archiveJobCard';
    card.innerHTML = `
      <div class="section-title">Job management</div>
      <p class="meta">Archive this job when it is complete. Its history, approvals, comments, photos, and payments are preserved.</p>
      <button id="archiveJobBtn" class="action-btn danger" type="button" style="width:100%">Archive job</button>
      <div id="archiveJobStatus" class="form-status"></div>`;
    root.appendChild(card);

    $('archiveJobBtn').addEventListener('click', async () => {
      const id = currentJobId;
      if (!id) return;
      if (!window.confirm('Archive this job? It will be removed from the active Jobs list.')) return;
      const button = $('archiveJobBtn');
      const status = $('archiveJobStatus');
      button.disabled = true;
      status.textContent = 'Archiving…';
      try {
        const result = await post('/api/mobile/jobs/' + id, { action: 'archive' });
        if (!result.response.ok) throw new Error(result.data?.error || 'Could not archive job.');
        loaded.jobs = false;
        await selectTab('jobs', true);
      } catch (err) {
        status.textContent = err?.message || 'Could not archive job.';
        button.disabled = false;
      }
    });
  }

  function ensureTeamControls() {
    const screen = $('teamScreen');
    if (!screen || $('addTeamMemberBtn')) return;
    const topbar = screen.querySelector('.topbar');
    if (!topbar) return;

    const refresh = $('refreshTeam');
    const actions = document.createElement('div');
    actions.className = 'actions';
    const add = document.createElement('button');
    add.id = 'addTeamMemberBtn';
    add.className = 'text-button';
    add.type = 'button';
    add.textContent = '+ Add';
    if (refresh) {
      refresh.parentNode.insertBefore(actions, refresh);
      actions.appendChild(add);
      actions.appendChild(refresh);
    } else {
      topbar.appendChild(actions);
      actions.appendChild(add);
    }

    const card = document.createElement('div');
    card.id = 'addTeamMemberCard';
    card.className = 'detail-card hidden';
    card.innerHTML = `
      <div class="section-title">Add team member</div>
      <form id="addTeamMemberForm">
        <div class="field"><label for="teamMemberName">Name</label><input id="teamMemberName" type="text" maxlength="200"></div>
        <div class="field"><label for="teamMemberPhone">Mobile phone</label><input id="teamMemberPhone" type="tel" inputmode="tel" required></div>
        <div class="field"><label for="teamMemberRole">Role</label><select id="teamMemberRole"><option value="admin">Admin</option><option value="owner">Owner</option></select></div>
        <button id="saveTeamMemberBtn" class="action-btn" type="submit" style="width:100%">Add team member</button>
        <div id="addTeamMemberStatus" class="form-status"></div>
      </form>`;
    const message = $('teamMessage');
    if (message) screen.insertBefore(card, message);
    else topbar.insertAdjacentElement('afterend', card);

    add.addEventListener('click', () => card.classList.toggle('hidden'));
    $('addTeamMemberForm').addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('saveTeamMemberBtn');
      const status = $('addTeamMemberStatus');
      button.disabled = true;
      status.textContent = 'Adding team member…';
      try {
        const result = await post('/api/mobile/team', {
          name: $('teamMemberName').value.trim(),
          phone: $('teamMemberPhone').value.trim(),
          role: $('teamMemberRole').value
        });
        if (!result.response.ok) throw new Error(result.data?.error || 'Could not add team member.');
        loaded.team = false;
        const invite = result.data?.inviteUrl;
        status.innerHTML = invite
          ? `Team member added ✓<br><a class="text-button" href="${invite}" target="_blank" rel="noopener">Open setup invitation</a>`
          : 'Team member added ✓ Existing account can sign in immediately.';
        $('teamMemberName').value = '';
        $('teamMemberPhone').value = '';
        await loadTeam();
      } catch (err) {
        status.textContent = err?.message || 'Could not add team member.';
      } finally {
        button.disabled = false;
      }
    });
  }

  const observer = new MutationObserver(() => {
    removeNativeFeatureCopies();
    ensureArchiveControl();
    ensureTeamControls();
  });

  document.addEventListener('DOMContentLoaded', () => {
    removeNativeFeatureCopies();
    ensureTeamControls();
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
