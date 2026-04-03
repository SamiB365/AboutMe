(() => {
  const fan = document.querySelector('.cards-fan');
  if (!fan) return;

  const slots = {
    s5: fan.querySelector('.card-back-4'),
    s4: fan.querySelector('.card-back-3'),
    s3: fan.querySelector('.card-back-2'),
    s2: fan.querySelector('.card-back-1'),
    s1: fan.querySelector('.card-front')
  };

  const slotOrder = [slots.s5, slots.s4, slots.s3, slots.s2, slots.s1];
  if (slotOrder.some((s) => !s)) return;

  const leftArrow = fan.querySelector('.fan-arrow-left');
  const rightArrow = fan.querySelector('.fan-arrow-right');

  let payloads = slotOrder.map((slot) => ({
    video: slot.querySelector('video') || null
  }));

  let lastSwipeAt = 0;

  function syncVideos() {
    const frontVideo = payloads[4]?.video || null;

    payloads.forEach((p) => {
      const v = p.video;
      if (!v) return;

      if (v === frontVideo) {
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        v.play().catch(() => {});
      } else {
        v.pause();
        v.currentTime = 0;
      }
    });
  }

  function render() {
    slotOrder.forEach((slot, i) => {
      while (slot.firstChild) slot.removeChild(slot.firstChild);
      if (payloads[i]?.video) slot.appendChild(payloads[i].video);
    });

    syncVideos();
  }

  function rotateForward() {
    payloads.unshift(payloads.pop()); // aina sama suunta (ei back)
    render();
  }

  // Klikki etukorttiin (estetään tuplalaukaisu heti swipen jälkeen)
  slots.s1.addEventListener('click', () => {
    if (Date.now() - lastSwipeAt < 250) return;
    rotateForward();
  });

  // Desktop-nuolet (molemmat eteenpäin)
  [leftArrow, rightArrow].forEach((btn) => {
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      rotateForward();
    });
  });

  // Swipe/drag (touch + mouse + pen)
  let startX = 0;
  let startY = 0;
  let tracking = false;
  const SWIPE_THRESHOLD = 28;

  slots.s1.style.touchAction = 'pan-y';

  slots.s1.addEventListener('pointerdown', (e) => {
    tracking = true;
    startX = e.clientX;
    startY = e.clientY;
  });

  slots.s1.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      lastSwipeAt = Date.now();
      rotateForward(); // vasen tai oikea => sama
    }
  });

  slots.s1.addEventListener('pointercancel', () => {
    tracking = false;
  });

  // Näppäimistö (accessibility)
  slots.s1.setAttribute('tabindex', '0');
  slots.s1.setAttribute('role', 'button');
  slots.s1.setAttribute('aria-label', 'Kierrä korttipinoa');

  slots.s1.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      rotateForward();
    }
  });

  render();
})();