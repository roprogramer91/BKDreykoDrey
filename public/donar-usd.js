(function () {
  document.addEventListener('DOMContentLoaded', () => {
    const amountInput = document.getElementById('amountUsd');
    const errorText = document.getElementById('errorUsd');
    const btnPagarUsd = document.getElementById('btnPagarUsd');

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
          // Placeholder para PayPal, Ko-fi, etc.
          const url = "https://example.com/donate?amount=" + encodeURIComponent(amount);
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
