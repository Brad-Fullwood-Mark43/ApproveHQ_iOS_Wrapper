'use strict';

(() => {
  const screen = document.getElementById('newJobScreen');
  const select = document.getElementById('jobCustomer');
  const jobStatus = document.getElementById('newJobStatus');
  const jobSubmit = document.getElementById('createJobSubmit');
  if (!screen || !select) return;

  const customerField = select.closest('.field');
  if (!customerField) return;

  const controls = document.createElement('div');
  controls.id = 'inlineCustomerControls';
  controls.innerHTML = `
    <button id="showInlineCustomer" class="action-btn secondary" type="button" style="width:100%;margin-top:10px">+ Add new customer</button>
    <div id="inlineCustomerPanel" class="hidden" style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(128,128,128,.25)">
      <div class="section-title">New customer</div>
      <form id="inlineCustomerForm">
        <div class="field"><label for="inlineCustomerName">Name</label><input id="inlineCustomerName" type="text" maxlength="200" required></div>
        <div class="field"><label for="inlineCustomerPhone">Phone</label><input id="inlineCustomerPhone" type="tel" inputmode="tel" required></div>
        <div class="field"><label for="inlineCustomerCompany">Business / Company</label><input id="inlineCustomerCompany" type="text" maxlength="200"></div>
        <div class="field"><label for="inlineCustomerEmail">Email</label><input id="inlineCustomerEmail" type="email"></div>
        <div class="action-grid">
          <button id="createInlineCustomer" class="action-btn" type="submit">Add & select customer</button>
          <button id="cancelInlineCustomer" class="action-btn secondary" type="button">Cancel</button>
        </div>
        <div id="inlineCustomerStatus" class="form-status"></div>
      </form>
    </div>`;
  customerField.appendChild(controls);

  const toggle = document.getElementById('showInlineCustomer');
  const panel = document.getElementById('inlineCustomerPanel');
  const cancel = document.getElementById('cancelInlineCustomer');
  const form = document.getElementById('inlineCustomerForm');
  const status = document.getElementById('inlineCustomerStatus');

  function setOpen(open) {
    panel.classList.toggle('hidden', !open);
    toggle.textContent = open ? 'Hide new customer' : '+ Add new customer';
    if (open) document.getElementById('inlineCustomerName')?.focus();
  }

  function customerLabel(customer) {
    const name = customer?.name || 'Customer';
    const company = customer?.company ? ` · ${customer.company}` : '';
    const phone = customer?.phone ? ` · ${customer.phone}` : '';
    return `${name}${company}${phone}`;
  }

  function selectCustomer(customer) {
    const id = Number(customer?.id);
    if (!Number.isInteger(id)) throw new Error('Customer was created, but no customer ID was returned.');

    let option = Array.from(select.options).find((item) => Number(item.value) === id);
    if (!option) {
      option = document.createElement('option');
      option.value = String(id);
      select.appendChild(option);
    }
    option.textContent = customerLabel(customer);
    select.value = String(id);
    select.disabled = false;
    if (jobSubmit) jobSubmit.disabled = false;

    if (jobStatus && /create a customer first|add a customer/i.test(jobStatus.textContent || '')) {
      jobStatus.textContent = '';
    }
  }

  toggle.addEventListener('click', () => setOpen(panel.classList.contains('hidden')));
  cancel.addEventListener('click', () => {
    setOpen(false);
    status.textContent = '';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const button = document.getElementById('createInlineCustomer');
    const payload = {
      name: document.getElementById('inlineCustomerName')?.value.trim(),
      phone: document.getElementById('inlineCustomerPhone')?.value.trim(),
      company: document.getElementById('inlineCustomerCompany')?.value.trim(),
      email: document.getElementById('inlineCustomerEmail')?.value.trim(),
    };

    if (!payload.name || !payload.phone) {
      status.textContent = 'Name and phone are required.';
      return;
    }

    button.disabled = true;
    status.textContent = 'Adding customer…';

    try {
      const result = await post('/api/mobile/customers', payload);
      if (!result.response.ok) throw new Error(result.data.error || 'Could not add customer.');

      selectCustomer(result.data.customer);
      loaded.customers = false;
      form.reset();
      setOpen(false);
      status.textContent = result.data.existing
        ? 'Existing customer selected ✓'
        : result.data.revived
          ? 'Customer restored and selected ✓'
          : 'Customer added and selected ✓';
    } catch (error) {
      status.textContent = error.message || 'Could not add customer.';
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('newJobBtn')?.addEventListener('click', () => {
    setOpen(false);
    status.textContent = '';
  });
})();
