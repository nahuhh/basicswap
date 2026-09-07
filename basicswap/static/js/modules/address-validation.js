(function (root) {
  'use strict';
  // Advisory destination address validation. The rules live in
  // BasicSwap.checkDestinationAddress, which is what actually gates a bid or a
  // settings write; this only surfaces the answer as the user types.
  const AddressValidation = (function() {
    const DEBOUNCE_MS = 250;

    function validate(coin, mode, address) {
      return fetch('/json/validateaddress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coin: coin, mode: mode, address: address }),
      })
        .then((response) => response.json())
        .catch(() => null);
    }

    // Attaches to an input carrying data-coin and data-mode. Returns a function
    // giving the last known result: true, false, or null when unknown (empty
    // input, request in flight, or the request failed).
    function attach(input, feedback, feedbackClass) {
      let valid = null;
      let timer = null;
      let sequence = 0;

      if (!input.dataset.coin) return () => null; // coin is not active

      const clear = () => {
        input.style.borderColor = '';
        if (feedback) {
          feedback.classList.add('hidden');
          feedback.textContent = '';
        }
      };

      const show = (result, message) => {
        input.style.borderColor = result ? '#22c55e' : '#ef4444';
        if (!feedback) return;
        feedback.textContent = (result ? '✓ ' : '✗ ') + message;
        feedback.className = feedbackClass + (result ? ' text-green-500' : ' text-red-500');
      };

      const run = () => {
        const address = input.value.trim();
        const request = ++sequence;
        if (address === '') {
          valid = null;
          clear();
          return;
        }
        validate(input.dataset.coin, input.dataset.mode || 'redeem', address).then((result) => {
          if (request !== sequence) return;
          if (!result) {
            valid = null;
            clear();
            return;
          }
          valid = result.valid;
          show(result.valid, result.valid ? 'Valid address' : result.error);
        });
      };

      const schedule = () => {
        valid = null;
        if (timer) clearTimeout(timer);
        timer = setTimeout(run, DEBOUNCE_MS);
      };

      input.addEventListener('input', schedule);
      input.addEventListener('blur', run);
      run();

      return () => valid;
    }

    return { attach, validate };
  })();

  root.AddressValidation = AddressValidation;
  if (typeof module !== "undefined" && module.exports) module.exports = AddressValidation;
})(typeof window !== "undefined" ? window : this);
