(() => {
  const fan = document.querySelector('.cards-fan');
  if (!fan) return;

  // Alkuperäinen visuaalinen järjestys (vasemmalta taakse -> eteen)
  const stackClasses = ['card-back-4', 'card-back-3', 'card-back-2', 'card-back-1', 'card-front'];

  // Ota kortit talteen DOM-järjestyksessä alussa
  let order = Array.from(fan.querySelectorAll('.stack-card'));

  function applyStack() {
    // Nollaa kaikki stack-luokat
    order.forEach((card) => {
      card.classList.remove('card-back-4', 'card-back-3', 'card-back-2', 'card-back-1', 'card-front');
    });

    // Aseta luokat aina indeksin mukaan => pino pysyy aina oikeana
    order.forEach((card, i) => {
      card.classList.add(stackClasses[i]);
    });

    // Varmista että front on päällimmäisenä myös DOM:ssa
    fan.appendChild(order[order.length - 1]);

    syncVideos();
  }

  function syncVideos() {
    const front = order[order.length - 1];

    order.forEach((card) => {
      const v = card.querySelector('video');
      if (!v) return;

      if (card === front) {
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

  // Klikkaus vain etummaiseen korttiin
  fan.addEventListener('click', (e) => {
    const front = order[order.length - 1];
    if (!front.contains(e.target)) return;

    // Siirrä etummainen pinon taakse
    order.unshift(order.pop());

    // Piirrä pino uudelleen oikein
    applyStack();
  });

  // Ensimmäinen render
  applyStack();
})();