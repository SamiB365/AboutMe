(() => {
  const fan = document.querySelector('.cards-fan');
  if (!fan) return;

  const getCards = () => Array.from(fan.querySelectorAll('.stack-card'));

  function syncVideos() {
    const cards = getCards();
    const front = cards[cards.length - 1];

    cards.forEach((card) => {
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

  fan.addEventListener('click', (e) => {
    const front = fan.querySelector('.card-front');
    if (!front) return;
    if (!front.contains(e.target)) return;

    front.classList.remove('card-front');
    front.classList.add('card-back-4');

    const map = [
      ['card-back-3', 'card-back-4'],
      ['card-back-2', 'card-back-3'],
      ['card-back-1', 'card-back-2']
    ];

    map.forEach(([from, to]) => {
      const el = fan.querySelector('.' + from);
      if (el) {
        el.classList.remove(from);
        el.classList.add(to);
      }
    });

    const newFrontCandidate = fan.querySelector('.card-back-4');
    if (newFrontCandidate && newFrontCandidate !== front) {
      newFrontCandidate.classList.remove('card-back-4');
      newFrontCandidate.classList.add('card-back-1');
    }

    const newFront = fan.querySelector('.card-back-1');
    if (newFront) {
      newFront.classList.remove('card-back-1');
      newFront.classList.add('card-front');
      fan.appendChild(newFront);
    } else {
      front.classList.remove('card-back-4');
      front.classList.add('card-front');
      fan.appendChild(front);
    }

    syncVideos();
  });

  syncVideos();
})();