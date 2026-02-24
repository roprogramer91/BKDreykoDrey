(function () {
  const API_BASE = window.DREYKO_API_BASE || 'https://bkdreykodrey-production.up.railway.app';

  document.addEventListener('DOMContentLoaded', async () => {
    const amountInput = document.getElementById('amountUsd');
    const errorText = document.getElementById('errorUsd');
    const successText = document.getElementById('successUsd');
    const btnPagarUsd = document.getElementById('btnPagarUsd');
    const chips = document.querySelectorAll('.dd-donation-chip');

    // Comprobar si volvemos de PayPal (capture flow)
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token'); // PayPal manda el orderId en el parámetro 'token'
    const PayerID = params.get('PayerID');
    const cancel = params.get('cancel');

    if (cancel) {
      if (errorText) errorText.textContent = 'El pago fue cancelado.';
    } else if (token && PayerID) {
      // Venimos de un approve en PayPal
      if (btnPagarUsd) btnPagarUsd.style.display = 'none';
      if (errorText) errorText.textContent = 'Procesando pago... por favor no cierres esta ventana.';
      
      try {
        const res = await fetch(`${API_BASE}/api/paypal/capture-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: token })
        });
        
        if (!res.ok) throw new Error('Fallo al capturar orden');
        
        const data = await res.json();
        if (data.status === 'COMPLETED') {
          if (errorText) errorText.textContent = '';
          if (successText) successText.textContent = '¡Pago completado! Muchas gracias por tu apoyo 🌎.';
        } else {
          throw new Error('Estado de pago no es completado');
        }
      } catch (err) {
        console.error('Error al capturar', err);
        if (errorText) errorText.textContent = 'Hubo un problema procesando tu pago. Por favor contactanos si se debitó tu saldo.';
        if (btnPagarUsd) btnPagarUsd.style.display = 'block'; // Rehabilitar
      }
    }

    // Flujo normal de creación
    if (chips) {
      chips.forEach(chip => {
        chip.addEventListener('click', () => {
          if (amountInput) {
            amountInput.value = chip.dataset.amount;
            if (errorText) errorText.textContent = '';
            if (successText) successText.textContent = '';
          }
        });
      });
    }

    if (btnPagarUsd && amountInput) {
      btnPagarUsd.addEventListener('click', async () => {
        const amount = Number(amountInput.value);
        if (!amount || amount <= 0) {
          if (errorText) errorText.textContent = 'Ingresá un monto mayor a 0.';
          return;
        }
        
        if (errorText) errorText.textContent = 'Iniciando conexión con PayPal...';
        if (successText) successText.textContent = '';
        btnPagarUsd.disabled = true;

        try {
          const res = await fetch(`${API_BASE}/api/paypal/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              amountUsd: amount,
              returnUrl: window.location.href.split('?')[0]
            })
          });
          
          if (!res.ok) throw new Error('Fallo al crear orden');
          const data = await res.json();
          
          if (data.approveUrl) {
            if (errorText) errorText.textContent = 'Redirigiendo a PayPal...';
            // PayPal approve needs to open in same window to return to capture easily, or can use window.location
            window.location.href = data.approveUrl;
          } else {
            throw new Error('Sin approveUrl');
          }
        } catch (err) {
          console.error('Error al crear orden PayPal', err);
          if (errorText) errorText.textContent = 'No se pudo iniciar el proceso con PayPal.';
        } finally {
          btnPagarUsd.disabled = false;
        }
      });
    }
  });
})();
