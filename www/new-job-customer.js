'use strict';

(() => {
  const screen = document.getElementById('newJobScreen');
  const toggle = document.getElementById('showInlineCustomer');
  const panel = document.getElementById('inlineCustomerPanel');
  const cancel = document.getElementById('cancelInlineCustomer');
  const form = document.getElementById('inlineCustomerForm');
  const select = document.getElementById('jobCustomer');
  const status = document.getElementById('inlineCustomerStatus');
  const jobStatus = document.getElementById('newJobStatus');
  const jobSubmit = document.getElementById('createJobSubmit');

  if (!screen || !toggle || !panel || !form || !select) return;

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
  cancel?.addEventListener('click', () => {
    setOpen(false);
    if (status) status.textContent = '';
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
      if (status) status.textContent = 'Name and phone are required.';
      return;
    }

    if (button) button.disabled = true;
    if (status) status.textContent = 'Adding customer…';

    try {
      const result = await post('/api/mobile/customers', payload);
      if (!result.response.ok) throw new Error(result.data.error || 'Could not add customer.');

      const customer = result.data.customer;
      selectCustomer(customer);
      loaded.customers = false;
      form.reset();
      setOpen(false);

      if (status) status.textContent = result.data.existing
        ? 'Existing customer selected ✓'
        : result.data.revived
          ? 'Customer restored and selected ✓'
          : 'Customer added and selected ✓';
    } catch (error) {
      if (status) status.textContent = error.message || 'Could not add customer.';
    } finally {
      if (button) button.disabled = false;
    }
  });

  document.getElementById('newJobBtn')?.addEventListener('click', () => {
    setOpen(false);
    if (status) status.textContent = '';
  });
})();
