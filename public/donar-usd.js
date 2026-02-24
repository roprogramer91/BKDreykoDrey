(function () {
  document.addEventListener('DOMContentLoaded', () => {
    const amountInput = document.getElementById('amountUsd');
    const errorText = document.getElementById('errorUsd');
    const btnPagarUsd = document.getElementById('btnPagarUsd');
    const chips = document.querySelectorAll('.dd-donation-chip');

    if (chips) {
      chips.forEach(chip => {
        chip.addEventListener('click', () => {
          if (amountInput) {
            amountInput.value = chip.dataset.amount;
            if (errorText) errorText.textContent = '';
          }
        });
      });
    }

    if (btnPagarUsd && amountInput) {
      btnPagarUsd.addEventListener('click', () => {
        const amount = Number(amountInput.value);
        if (!amount || amount <= 0) {
          if (errorText) errorText.textContent = 'Ingresá un monto mayor a 0.';
          return;
        }
        
        if (errorText) errorText.textContent = 'Redirigiendo...';
        btnPagarUsd.disabled = true;

        try {
          const url = "https://paypal.me/dreykodrey/" + encodeURIComponent(amount);
          window.location.href = url;
        } catch (err) {
          console.error('Error al redirigir', err);
          if (errorText) errorText.textContent = 'No se pudo iniciar el proceso.';
        } finally {
          btnPagarUsd.disabled = false;
        }
      });
    }
  });
})();
