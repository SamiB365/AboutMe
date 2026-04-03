(() => {
  const fan = document.querySelector('.cards-fan');
  if (!fan) return;

  // Kiinteät slotit DOM-järjestyksessä: 5 -> 1 (taaimmainen ... etummainen)
  const slots = {
    s5: fan.querySelector('.card-back-4'),
    s4: fan.querySelector('.card-back-3'),
    s3: fan.querySelector('.card-back-2'),
    s2: fan.querySelector('.card-back-1'),
    s1: fan.querySelector('.card-front') // etummainen
  };

  const slotOrder = [slots.s5, slots.s4, slots.s3, slots.s2, slots.s1];
  if (slotOrder.some((s) => !s)) return;

  // Jokaiselle slotille oma "media payload" (voi olla video tai tyhjä)
  // Alussa: vain etuslotissa on video, muissa tyhjä
  let payloads = slotOrder.map((slot) => {
    const video = slot.querySelector('video');
    return { video }; // video voi olla null
  });

  // Tyhjennä slotit ja aseta payloadit takaisin slottijärjestykseen
  function render() {
    slotOrder.forEach((slot, i) => {
      // Poista vanha sisältö
      while (slot.firstChild) slot.removeChild(slot.firstChild);

      const p = payloads[i];
      if (p.video) {
        slot.appendChild(p.video);
      }
    });

    syncVideos();
  }

  // Vain etummainen slot (s1) pyörii
  function syncVideos() {
    const frontVideo = payloads[4]?.video || null; // slot1

    payloads.forEach((p) => {
      if (!p.video) return;
      if (p.video === frontVideo) {
        p.video.muted = true;
        p.video.loop = true;
        p.video.playsInline = true;
        p.video.play().catch(() => {});
      } else {
        p.video.pause();
        p.video.currentTime = 0;
      }
    });
  }

  // Klikki vain etummaiseen slottiin
  slots.s1.addEventListener('click', () => {
    // Kierto: s1 -> s5, s5 -> s4, s4 -> s3, s3 -> s2, s2 -> s1
    // Eli arrayn viimeinen siirtyy alkuun
    payloads.unshift(payloads.pop());
    render();
  });

  render();
})();