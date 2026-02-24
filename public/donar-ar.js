(function () {
  const API_BASE = window.DREYKO_API_BASE || 'https://bkdreykodrey-production.up.railway.app';

  document.addEventListener('DOMContentLoaded', () => {
    const amountInput = document.getElementById('amountArs');
    const errorText = document.getElementById('errorArs');
    const btnPagar = document.getElementById('btnPagar');
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

    if (btnPagar && amountInput) {
      btnPagar.addEventListener('click', async () => {
        const amount = Number(amountInput.value);
        if (!amount || amount <= 0) {
          if (errorText) errorText.textContent = 'Ingresá un monto mayor a 0.';
          return;
        }
        
        if (errorText) errorText.textContent = 'Iniciando pago...';
        btnPagar.disabled = true;

        try {
          const res = await fetch(`${API_BASE}/api/create-mp-preference`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ unit_price: amount })
          });
          if (!res.ok) throw new Error('Error en API MP');
          const data = await res.json();
          if (data.init_point) {
            if (errorText) errorText.textContent = '';
            window.location.href = data.init_point;
          } else {
            throw new Error('Sin init_point');
          }
        } catch (err) {
          console.error('Error al iniciar pago MP', err);
          if (errorText) errorText.textContent = 'No se pudo iniciar el pago. Probá de nuevo.';
        } finally {
          btnPagar.disabled = false;
        }
      });
    }
  });
})();
