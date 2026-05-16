'use strict';

// ─── PWA Install Prompt ───────────────────────────────────────────────────────

let deferredInstallPrompt = null;
const installButtons = document.querySelectorAll('.js-install-btn');
const installSuccessMsgs = document.querySelectorAll('.js-install-success');

// Listen for the beforeinstallprompt event and stash it
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  // Show all install buttons
  installButtons.forEach(btn => {
    btn.style.display = '';
    btn.removeAttribute('hidden');
  });
});

// Handle install button clicks
installButtons.forEach(btn => {
  btn.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        deferredInstallPrompt = null;
        installButtons.forEach(b => b.setAttribute('hidden', ''));
      }
    } else {
      // No prompt available — scroll to install instructions
      const installSection = document.getElementById('install');
      if (installSection) {
        installSection.scrollIntoView({ behavior: 'smooth' });
        // Open the relevant platform accordion
        const platformsEl = installSection.querySelector('.install-platforms');
        if (platformsEl) {
          const details = platformsEl.querySelector('details');
          if (details) details.open = true;
        }
      }
    }
  });
});

// Track successful install
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  installButtons.forEach(btn => btn.setAttribute('hidden', ''));
  installSuccessMsgs.forEach(msg => {
    msg.style.display = '';
    msg.removeAttribute('hidden');
  });
});

// ─── Platform Detection ────────────────────────────────────────────────────────

function detectPlatform() {
  const ua = navigator.userAgent;
  const isIOS = /iP(hone|od|ad)/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
  const isChrome = /Chrome/.test(ua) && !/Edg/.test(ua);
  const isEdge = /Edg/.test(ua);

  if (isIOS && isSafari) return 'ios-safari';
  if (isIOS) return 'ios-other';
  if (isAndroid && isChrome) return 'android-chrome';
  if (isAndroid) return 'android-other';
  if (isChrome || isEdge) return 'desktop-chromium';
  return 'other';
}

// ─── DOMContentLoaded: Platform accordion + standalone/installed checks ────────

document.addEventListener('DOMContentLoaded', () => {

  // Auto-open the relevant platform instructions accordion
  const platform = detectPlatform();
  const platformMap = {
    'ios-safari':       'details[data-platform="ios"]',
    'ios-other':        'details[data-platform="ios"]',
    'android-chrome':   'details[data-platform="android"]',
    'android-other':    'details[data-platform="android"]',
    'desktop-chromium': 'details[data-platform="desktop"]',
    'other':            null,
  };

  const selector = platformMap[platform];
  if (selector) {
    const el = document.querySelector(selector);
    if (el) el.open = true;
  }

  // Check if already running as installed PWA (standalone mode)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    !!navigator.standalone;

  if (isStandalone) {
    // User already has it installed — update CTAs to open the app
    installButtons.forEach(btn => {
      btn.textContent = 'Open App';
      btn.href = '/app/';
      btn.style.display = '';
      btn.removeAttribute('hidden');
    });
  }

  // Check via getInstalledRelatedApps if available (non-standalone contexts)
  if (!isStandalone && 'getInstalledRelatedApps' in navigator) {
    navigator.getInstalledRelatedApps().then(apps => {
      if (apps.length > 0) {
        installButtons.forEach(btn => {
          btn.textContent = 'Already Installed';
          btn.setAttribute('disabled', '');
          btn.style.display = '';
          btn.removeAttribute('hidden');
        });
        installSuccessMsgs.forEach(msg => {
          msg.style.display = '';
          msg.removeAttribute('hidden');
        });
      }
    }).catch(() => {
      // getInstalledRelatedApps is best-effort; silently ignore errors
    });
  }
});

// ─── Navigation: Hamburger Menu ───────────────────────────────────────────────

const hamburger = document.getElementById('nav-hamburger');
const navLinks = document.getElementById('nav-links');

if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    const isOpen = hamburger.getAttribute('aria-expanded') === 'true';
    hamburger.setAttribute('aria-expanded', String(!isOpen));
    navLinks.classList.toggle('is-open', !isOpen);
    // Prevent body scroll when menu is open
    document.body.style.overflow = !isOpen ? 'hidden' : '';
  });

  // Close on nav link click (mobile)
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.setAttribute('aria-expanded', 'false');
      navLinks.classList.remove('is-open');
      document.body.style.overflow = '';
    });
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navLinks.classList.contains('is-open')) {
      hamburger.setAttribute('aria-expanded', 'false');
      navLinks.classList.remove('is-open');
      document.body.style.overflow = '';
      hamburger.focus();
    }
  });
}

// ─── Active Nav Link on Scroll ─────────────────────────────────────────────────

const sections = document.querySelectorAll('section[id]');
const navAnchorLinks = document.querySelectorAll('.nav-links a[href^="#"]');

if (sections.length && navAnchorLinks.length) {
  const navObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          navAnchorLinks.forEach(link => {
            const isActive = link.getAttribute('href') === `#${id}`;
            link.classList.toggle('active', isActive);
            link.setAttribute('aria-current', isActive ? 'true' : 'false');
          });
        }
      });
    },
    { rootMargin: '-50% 0px -50% 0px', threshold: 0 }
  );
  sections.forEach(section => navObserver.observe(section));
}

// ─── Scroll Animations ────────────────────────────────────────────────────────

// Respect prefers-reduced-motion
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!prefersReducedMotion) {
  const animatedEls = document.querySelectorAll('[data-animate]');
  const staggerParents = document.querySelectorAll('[data-animate-stagger]');

  const animObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          animObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  animatedEls.forEach(el => animObserver.observe(el));
  staggerParents.forEach(el => animObserver.observe(el));
} else {
  // If reduced motion: make everything visible immediately
  document.querySelectorAll('[data-animate], [data-animate-stagger]').forEach(el => {
    el.classList.add('is-visible');
  });
}

// ─── Smooth Scroll for anchor links ──────────────────────────────────────────

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const targetId = anchor.getAttribute('href').slice(1);
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Update URL without triggering scroll
      history.pushState(null, '', `#${targetId}`);
    }
  });
});

// ─── Nav scroll shadow ────────────────────────────────────────────────────────

const siteNav = document.querySelector('.site-nav');
if (siteNav) {
  window.addEventListener('scroll', () => {
    siteNav.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });
}
