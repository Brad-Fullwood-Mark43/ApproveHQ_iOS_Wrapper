'use strict';

(() => {
  let deliveryJobId = null;
  let deliveryData = null;
  let deliveryLoading = false;

  function makePhoneOptional(input, labelText = 'Phone') {
    if (!input) return;
    input.required = false;
    input.removeAttribute('required');
    input.placeholder = input.placeholder || 'Optional — add later if unknown';
    const field = input.closest('.field');
    const label = field?.querySelector('label');
    if (label && !label.dataset.optionalPhoneLabel) {
      label.textContent = `${labelText} (optional)`;
      label.dataset.optionalPhoneLabel = 'true';
    }
  }

  function applyOptionalPhoneFields() {
    makePhoneOptional(document.getElementById('customerPhone'));
    makePhoneOptional(document.getElementById('ecPhone'));
    makePhoneOptional(document.getElementById('inlineCustomerPhone'));
  }

  function approvalShareText(job) {
    const business = currentUser?.businessName || 'ApproveHQ';
    const title = job?.title ? ` (${job.title})` : '';
    return `${business}: Job #${job?.number || ''}${title} is ready for your approval.`;
  }

  async function shareJob(job, shareUrl, status) {
    const text = approvalShareText(job);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Job #${job.number} approval`,
          text,
          url: shareUrl,
        });

        try {
          const marked = await post(`/api/mobile/jobs/${job.id}`, { action: 'mark_sent' });
          if (marked.response.ok) {
            loaded.jobs = false;
            deliveryData = { ...deliveryData, customerNotified: true };
            await loadJob(job.id);
            return;
          }
        } catch {
          // Sharing succeeded even if tracking could not be updated.
        }

        status.textContent = 'Shared ✓';
        return;
      } catch (error) {
        if (error?.name === 'AbortError') {
          status.textContent = '';
          return;
        }
      }
    }

    try {
      await navigator.clipboard.writeText(`${text} ${shareUrl}`);
      status.textContent = 'Share sheet unavailable. Approval message copied — paste it into Snapchat or another app.';
    } catch {
      status.textContent = 'Could not open Share or copy the approval link.';
    }
  }

  async function getDeliveryData() {
    const jobId = Number(currentJobId);
    if (!Number.isInteger(jobId) || jobId <= 0) return null;
    if (deliveryJobId === jobId && deliveryData) return deliveryData;
    if (deliveryLoading) return null;

    deliveryLoading = true;
    try {
      const response = await get(`/api/mobile/jobs/${jobId}`);
      if (!response.response.ok) return null;
      deliveryJobId = jobId;
      deliveryData = response.data;
      return deliveryData;
    } catch {
      return null;
    } finally {
      deliveryLoading = false;
    }
  }

  function applyPaymentPhoneState(hasPhone) {
    const paymentButton = document.getElementById('payBtn');
    const paymentStatus = document.getElementById('payStatus');
    if (!paymentButton) return;

    if (!hasPhone) {
      paymentButton.disabled = true;
      paymentButton.title = 'Add a phone number before sending a payment request by text.';
      if (paymentStatus) paymentStatus.textContent = 'Add a customer phone number before sending a payment request by text.';
    }
  }

  async function enhanceJobDelivery() {
    const sendButton = document.getElementById('sendApprovalBtn');
    if (!sendButton || !currentJobId) return;

    const data = await getDeliveryData();
    if (!data) return;

    const job = data.job || {};
    const shareUrl = data.shareUrl || '';
    const status = document.getElementById('sendStatus');
    const hasPhone = Boolean(String(job.customer_phone || '').trim());

    sendButton.textContent = 'Send Text';
    if (!hasPhone) {
      sendButton.disabled = true;
      sendButton.title = 'Add a phone number to send by text.';
      if (status && !status.textContent) {
        status.textContent = 'No phone number on file. Use Share, or add a phone number to enable texting.';
      }
    }

    const openMessages = document.getElementById('openMessagesBtn');
    if (openMessages && !hasPhone) {
      openMessages.disabled = true;
      openMessages.title = 'Add a phone number to open Messages.';
    }

    if (!document.getElementById('shareApprovalBtn')) {
      const shareButton = document.createElement('button');
      shareButton.id = 'shareApprovalBtn';
      shareButton.className = 'action-btn';
      shareButton.type = 'button';
      shareButton.style.width = '100%';
      shareButton.style.marginTop = '10px';
      shareButton.textContent = 'Share';
      sendButton.insertAdjacentElement('afterend', shareButton);

      shareButton.addEventListener('click', async () => {
        shareButton.disabled = true;
        const liveStatus = document.getElementById('sendStatus');
        if (liveStatus) liveStatus.textContent = 'Opening Share…';
        try {
          await shareJob(job, shareUrl, liveStatus || { textContent: '' });
        } finally {
          shareButton.disabled = false;
        }
      });
    }

    applyPaymentPhoneState(hasPhone);
  }

  applyOptionalPhoneFields();

  const observer = new MutationObserver(() => {
    applyOptionalPhoneFields();
    enhanceJobDelivery();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  enhanceJobDelivery();
})();
