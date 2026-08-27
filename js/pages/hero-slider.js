document.addEventListener('DOMContentLoaded', () => {
  const viewport = document.getElementById('hero-slider');
  const track = document.getElementById('hero-slider-track');
  const dotsContainer = document.getElementById('hero-slider-dots');
  if (!track || !viewport) return;

  const slides = track.querySelectorAll('.hero-slide');
  const totalSlides = slides.length;
  let currentIndex = 0;
  let autoplayTimer = null;
  let isDragging = false;
  let startX = 0;
  let dragCurrent = null, dragNext = null, dragPrev = null;

  // ── Dots ──
  const dots = [];
  if (dotsContainer) {
    slides.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = 'hero-dot';
      dot.addEventListener('click', () => {
        if (i === currentIndex) return;
        stopAutoplay();
        showSlide(i, i > currentIndex ? 1 : -1);
        startAutoplay();
      });
      dotsContainer.appendChild(dot);
      dots.push(dot);
    });
  }

  function updateDots(activeIndex) {
    dots.forEach((dot, i) => dot.classList.toggle('is-current', i === activeIndex));
  }

  // instantly place a slide at a position, no animation
  function placeInstant(slide, className) {
    slide.style.transition = 'none';
    slide.classList.remove('pos-left', 'pos-center', 'pos-right');
    slide.classList.add(className);
    void slide.offsetWidth;
    slide.style.transition = '';
  }

  function showSlide(index, direction) {
    const nextIndex = (index + totalSlides) % totalSlides;
    if (nextIndex === currentIndex) return;

    const currentSlide = slides[currentIndex];
    const nextSlide = slides[nextIndex];

    placeInstant(nextSlide, direction === 1 ? 'pos-right' : 'pos-left');

    requestAnimationFrame(() => {
      currentSlide.classList.remove('pos-center');
      currentSlide.classList.add(direction === 1 ? 'pos-left' : 'pos-right');

      nextSlide.classList.remove('pos-left', 'pos-right');
      nextSlide.classList.add('pos-center');
    });

    currentIndex = nextIndex;
    updateDots(currentIndex);
  }

  function nextSlide() {
    showSlide(currentIndex + 1, 1);
  }

  function prevSlide() {
    showSlide(currentIndex - 1, -1);
  }

  function startAutoplay() {
    stopAutoplay();
    autoplayTimer = setInterval(nextSlide, 3500);
  }

  function stopAutoplay() {
    if (autoplayTimer) clearInterval(autoplayTimer);
  }

  // ── Drag-follow (finger controls the slide directly) ──
  viewport.addEventListener('touchstart', (e) => {
    isDragging = true;
    startX = e.touches[0].clientX;
    stopAutoplay(); // touching stops the autoplay immediately

    dragCurrent = slides[currentIndex];
    dragNext = slides[(currentIndex + 1) % totalSlides];
    dragPrev = slides[(currentIndex - 1 + totalSlides) % totalSlides];

    [dragCurrent, dragNext, dragPrev].forEach((s) => (s.style.transition = 'none'));
    placeInstant(dragNext, 'pos-right');
    placeInstant(dragPrev, 'pos-left');
    dragNext.style.transition = 'none';
    dragPrev.style.transition = 'none';
  });

  viewport.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const deltaX = e.touches[0].clientX - startX;
    const percent = (deltaX / viewport.offsetWidth) * 100;

    dragCurrent.style.transform = `translateX(${percent}%) scale(1)`;
    dragCurrent.style.opacity = 1;

    if (deltaX < 0) {
      dragNext.style.transform = `translateX(${100 + percent}%) scale(0.85)`;
      dragNext.style.opacity = 1;
      dragPrev.style.opacity = 0;
    } else if (deltaX > 0) {
      dragPrev.style.transform = `translateX(${-100 + percent}%) scale(0.85)`;
      dragPrev.style.opacity = 1;
      dragNext.style.opacity = 0;
    }
  });

  viewport.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    isDragging = false;

    const deltaX = e.changedTouches[0].clientX - startX;
    const threshold = viewport.offsetWidth * 0.15;

    const committedForward = deltaX < -threshold;
    const committedBackward = deltaX > threshold;

    // clear existing position classes on all three, but do NOT touch
    // their inline transform/opacity yet — they stay exactly where
    // your finger left them for one more instant
    [dragCurrent, dragNext, dragPrev].forEach((s) =>
      s.classList.remove('pos-left', 'pos-center', 'pos-right')
    );

    if (committedForward) {
      currentIndex = (currentIndex + 1) % totalSlides;
      dragCurrent.classList.add('pos-left');
      dragNext.classList.add('pos-center');
      dragPrev.classList.add('pos-right');
    } else if (committedBackward) {
      currentIndex = (currentIndex - 1 + totalSlides) % totalSlides;
      dragCurrent.classList.add('pos-right');
      dragPrev.classList.add('pos-center');
      dragNext.classList.add('pos-right');
    } else {
      dragCurrent.classList.add('pos-center');
      dragNext.classList.add('pos-right');
      dragPrev.classList.add('pos-left');
    }
    updateDots(currentIndex);

    const SWIPE_SPEED = '0.4s'; // ← adjust this to taste

    // Wait one frame to let the browser "lock in" the current visual
    // position, THEN turn on the transition and set the final position
    // in the NEXT frame. Doing both in the same frame causes a stutter.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        [dragCurrent, dragNext, dragPrev].forEach((s) => {
          s.style.transition = `transform ${SWIPE_SPEED} ease-in-out, opacity ${SWIPE_SPEED} ease-in-out`;
          s.style.transform = '';
          s.style.opacity = '';
        });
      });
    });

    // after the fast transition finishes, remove the inline override so
    // autoplay/dot-clicks go back to using the normal CSS speed (0.7s)
    setTimeout(() => {
      [dragCurrent, dragNext, dragPrev].forEach((s) => {
        s.style.transition = '';
      });
    }, 400); // slightly longer than SWIPE_SPEED to be safe

    startAutoplay();
  });

  // start with the first slide visible, others parked to the right
  slides.forEach((slide, i) => {
    placeInstant(slide, i === 0 ? 'pos-center' : 'pos-right');
  });
  updateDots(0);

  startAutoplay();
});