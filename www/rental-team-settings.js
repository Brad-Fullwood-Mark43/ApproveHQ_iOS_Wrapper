'use strict';
(function () {
  const $ = id => document.getElementById(id);
  let loading = false;

  function isRentalBusiness() {
    return window.currentUser?.businessType === 'dumpster_rental';
  }

  function isOwner() {
    return window.currentUser?.role === 'owner' || window.currentUser?.isMaster;
  }

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function installCard() {
    const screen = $('nativeFeaturesScreen');
    if (!screen || $('rentalTeamAdminCard') || !isRentalBusiness()) return;

    const card = document.createElement('div');
    card.id = 'rentalTeamAdminCard';
    card.className = 'detail-card';
    card.innerHTML = `
      <div class="row">
        <div>
          <div class="eyebrow">Business access</div>
          <div class="section-title" style="margin:2px 0 0">Team & Admins</div>
        </div>
        <button id="refreshRentalTeam" class="text-button" type="button">Refresh</button>
      </div>
      <p class="meta" style="margin-top:8px">Add people who can help manage this rental business.</p>
      <div id="rentalTeamStatus" class="loading">Loading team…</div>
      <div id="rentalTeamContent" class="hidden">
        <div id="rentalTeamList"></div>
        <div id="rentalTeamOwnerControls" style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(128,128,128,.18)">
          <div class="section-title" style="font-size:16px">Add team member</div>
          <div class="field"><label>Name</label><input id="rentalTeamName" autocomplete="name" placeholder="Team member name"></div>
          <div class="field"><label>Mobile phone</label><input id="rentalTeamPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(936) 555-1234"></div>
          <div class="field"><label>Access level</label><select id="rentalTeamRole"><option value="admin">Admin</option><option value="owner">Owner</option></select></div>
          <p class="meta">Admins can run day-to-day rental operations. Owners can also manage team access and business settings.</p>
          <button id="addRentalTeamMember" class="action-btn" type="button" style="width:100%">Add & send invite</button>
          <div id="rentalTeamActionStatus" class="form-status"></div>
        </div>
      </div>`;

    const businessCard = $('businessSwitcherCard');
    if (businessCard?.nextSibling) screen.insertBefore(card, businessCard.nextSibling);
    else {
      const logoCard = $('businessLogoCard');
      if (logoCard?.nextSibling) screen.insertBefore(card, logoCard.nextSibling);
      else screen.appendChild(card);
    }

    $('refreshRentalTeam')?.addEventListener('click', loadTeam);
    $('addRentalTeamMember')?.addEventListener('click', addMember);
  }

  function memberRow(member) {
    const pending = Boolean(member.pending);
    const disabled = Boolean(member.disabled_at);
    const roleLabel = member.role === 'owner' ? 'Owner' : 'Admin';
    return `<div class="rental-team-row" data-team-user="${Number(member.id)}" style="padding:12px 0;border-bottom:1px solid rgba(128,128,128,.16)">
      <div class="row" style="align-items:flex-start">
        <div style="min-width:0">
          <strong>${esc(member.name || 'Team member')}</strong>
          <div class="meta">${esc(member.phone || '')}</div>
          <div class="meta">${roleLabel}${pending ? ' · Invite pending' : ''}${disabled ? ' · Disabled' : ''}</div>
        </div>
        <span class="status-pill ${pending ? 'status-waiting' : disabled ? 'status-changes' : 'status-complete'}">${pending ? 'Pending' : disabled ? 'Disabled' : roleLabel}</span>
      </div>
      ${isOwner() && !disabled ? `<div class="action-grid" style="margin-top:10px">
        <button class="action-btn secondary edit-rental-team" data-user-id="${Number(member.id)}" data-user-name="${esc(member.name || '')}" data-user-role="${esc(member.role || 'admin')}" type="button">Edit access</button>
        ${pending ? `<button class="action-btn secondary resend-rental-team" data-user-id="${Number(member.id)}" type="button">Resend invite</button>` : ''}
      </div>` : ''}
    </div>`;
  }

  async function loadTeam() {
    if (loading || !isRentalBusiness()) return;
    installCard();
    const status = $('rentalTeamStatus');
    const content = $('rentalTeamContent');
    if (!status || !content) return;

    if (!isOwner()) {
      status.textContent = 'Only a business owner can manage team access.';
      status.classList.remove('hidden');
      content.classList.add('hidden');
      return;
    }

    loading = true;
    status.textContent = 'Loading team…';
    status.classList.remove('hidden');
    content.classList.add('hidden');
    try {
      const x = await get('/api/mobile/team');
      if (!x.response.ok) throw new Error(x.data?.error || 'Could not load team.');
      const users = Array.isArray(x.data?.users) ? x.data.users : [];
      $('rentalTeamList').innerHTML = users.length ? users.map(memberRow).join('') : '<div class="meta">No team members yet.</div>';
      $('rentalTeamOwnerControls')?.classList.toggle('hidden', !isOwner());
      status.classList.add('hidden');
      content.classList.remove('hidden');
      bindMemberActions();
    } catch (err) {
      status.textContent = err?.message || 'Could not load team.';
    } finally {
      loading = false;
    }
  }

  function bindMemberActions() {
    document.querySelectorAll('.resend-rental-team').forEach(button => button.addEventListener('click', async () => {
      const s = $('rentalTeamActionStatus');
      button.disabled = true;
      s.textContent = 'Sending invitation…';
      try {
        const x = await post('/api/mobile/team', { action:'resend_invite', userId:Number(button.dataset.userId) });
        if (!x.response.ok) throw new Error(x.data?.error || 'Could not resend invitation.');
        s.textContent = 'Invitation sent ✓';
      } catch (err) {
        s.textContent = err?.message || 'Could not resend invitation.';
      } finally {
        button.disabled = false;
      }
    }));

    document.querySelectorAll('.edit-rental-team').forEach(button => button.addEventListener('click', async () => {
      const currentName = button.dataset.userName || '';
      const currentRole = button.dataset.userRole || 'admin';
      const name = window.prompt('Team member name', currentName);
      if (name === null) return;
      const roleInput = window.prompt('Access level: type admin or owner', currentRole);
      if (roleInput === null) return;
      const role = String(roleInput).trim().toLowerCase() === 'owner' ? 'owner' : 'admin';
      const s = $('rentalTeamActionStatus');
      s.textContent = 'Updating access…';
      try {
        const x = await post('/api/mobile/team', { action:'update_member', userId:Number(button.dataset.userId), name:String(name).trim(), role });
        if (!x.response.ok) throw new Error(x.data?.error || 'Could not update team member.');
        s.textContent = 'Access updated ✓';
        await loadTeam();
      } catch (err) {
        s.textContent = err?.message || 'Could not update team member.';
      }
    }));
  }

  async function addMember() {
    const button = $('addRentalTeamMember');
    const status = $('rentalTeamActionStatus');
    const name = $('rentalTeamName')?.value.trim();
    const phone = $('rentalTeamPhone')?.value.trim();
    const role = $('rentalTeamRole')?.value === 'owner' ? 'owner' : 'admin';
    if (!phone) {
      status.textContent = 'Mobile phone is required.';
      return;
    }
    button.disabled = true;
    status.textContent = 'Adding team member…';
    try {
      const x = await post('/api/mobile/team', { name, phone, role });
      if (!x.response.ok) throw new Error(x.data?.error || 'Could not add team member.');
      status.textContent = x.data?.inviteSent
        ? 'Team member added and invitation text sent ✓'
        : `Team member added.${x.data?.inviteError ? ' ' + x.data.inviteError : ''}`;
      $('rentalTeamName').value = '';
      $('rentalTeamPhone').value = '';
      $('rentalTeamRole').value = 'admin';
      await loadTeam();
    } catch (err) {
      status.textContent = err?.message || 'Could not add team member.';
    } finally {
      button.disabled = false;
    }
  }

  function onSettingsOpen() {
    if (!isRentalBusiness()) {
      $('rentalTeamAdminCard')?.remove();
      return;
    }
    installCard();
    loadTeam();
  }

  $('nativeFeaturesBtn')?.addEventListener('click', () => setTimeout(onSettingsOpen, 0));
  $('refreshNativeFeatures')?.addEventListener('click', () => setTimeout(onSettingsOpen, 0));

  const observer = new MutationObserver(() => {
    const screen = $('nativeFeaturesScreen');
    if (screen && !screen.classList.contains('hidden') && isRentalBusiness()) installCard();
  });
  const main = $('mainView');
  if (main) observer.observe(main, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
})();
