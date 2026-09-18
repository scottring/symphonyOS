const SUPABASE_URL = 'https://mwadppyrqzuzgstmwpuy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13YWRwcHlycXp1emdzdG13cHV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzU0MjcsImV4cCI6MjA4MDExMTQyN30._bWsOu6D-UAMKsxEMzN7PhMM4ENIXr2uZWdVLcoILk4';

(function () {
  const form = document.getElementById('founding-form');
  if (!form) return;
  const input = document.getElementById('founding-email');
  const honeypot = document.getElementById('founding-website');
  const button = document.getElementById('founding-submit');
  const note = document.getElementById('founding-note');
  const idleLabel = button.textContent;

  function showDone(title, body) {
    const done = document.createElement('div');
    done.className = 'cta-done';
    done.setAttribute('role', 'status');
    done.innerHTML = '<strong></strong><span></span>';
    done.querySelector('strong').textContent = title;
    done.querySelector('span').textContent = body;
    form.replaceWith(done);
    note.textContent = 'Questions before then? hello@symphony-os.com';
    note.classList.remove('is-error');
  }

  function showError(message) {
    note.classList.add('is-error');
    note.innerHTML = '';
    note.append(message + ' ');
    const a = document.createElement('a');
    a.href = 'mailto:hello@symphony-os.com?subject=Founding%20household';
    a.textContent = 'Email hello@symphony-os.com instead.';
    note.append(a);
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (honeypot.value) { showDone("You're in line.", "We'll write back within a day."); return; }
    const email = input.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      showError('That email does not look right.');
      return;
    }
    input.removeAttribute('aria-invalid');
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/waitlist', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ email: email, source: 'founding_household' }),
      });
      if (res.status === 201) {
        showDone("You're in line.", "We'll write to " + email + " within a day to set up your household together.");
        return;
      }
      if (res.status === 409) {
        showDone("You're already on the list.", "We have " + email + " and we'll be in touch.");
        return;
      }
      throw new Error('signup failed: ' + res.status);
    } catch (err) {
      console.error(err);
      button.disabled = false;
      button.textContent = idleLabel;
      showError("We couldn't save that just now.");
    }
  });

  // Arriving via a "Become a founding household" link lands the cursor in the field.
  document.querySelectorAll('a[href="#waitlist"]').forEach(function (a) {
    a.addEventListener('click', function () { setTimeout(function () { input.focus({ preventScroll: true }); }, 700); });
  });
})();
