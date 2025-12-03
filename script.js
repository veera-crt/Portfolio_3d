document.addEventListener('DOMContentLoaded', () => {
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');

    // Mobile Menu Toggle
    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navLinks.classList.toggle('active');
    });

    // Close mobile menu when clicking a link
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('active');
            navLinks.classList.remove('active');
        });
    });

    // Smooth Scrolling for anchor links with offset
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                const navHeight = document.querySelector('.navbar').offsetHeight;
                const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - navHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });

                // Close mobile menu if open
                hamburger.classList.remove('active');
                navLinks.classList.remove('active');
            }
        });
    });

    // Scroll Animation (Intersection Observer)
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);

    document.querySelectorAll('.section').forEach(section => {
        section.classList.add('fade-in');
        observer.observe(section);
    });

    // --- Background Particles & Lighting ---
    const canvas = document.getElementById('hero-canvas');
    const ctx = canvas.getContext('2d');
    let width, height;

    // Particles
    const particles = [];
    const particleCount = 200; // Increased count since shield is gone

    // Mouse position for interaction
    let mouseX = 0;
    let mouseY = 0;
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
    }
    window.addEventListener('resize', resize);
    resize();

    class CyberParticle {
        constructor() {
            this.reset();
        }
        reset() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.size = Math.random() * 2 + 0.5;
            this.speedX = (Math.random() - 0.5) * 0.5;
            this.speedY = (Math.random() - 0.5) * 0.5;
            this.life = Math.random() * 100 + 50;
            this.maxLife = this.life;
            // Vibrant colors: Cyan, Purple, Pink, Gold, Blue
            const colors = [
                'rgba(0, 242, 234, ',   // Cyan
                'rgba(108, 92, 231, ',  // Purple
                'rgba(255, 0, 85, ',    // Pink
                'rgba(255, 215, 0, ',   // Gold
                'rgba(79, 172, 254, '   // Blue
            ];
            this.colorPrefix = colors[Math.floor(Math.random() * colors.length)];
        }
        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            this.life--;

            // Mouse repulsion
            const dx = mouseX - this.x;
            const dy = mouseY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 150) {
                this.x -= dx * 0.02;
                this.y -= dy * 0.02;
            }

            if (this.life <= 0 || this.x < 0 || this.x > width || this.y < 0 || this.y > height) {
                this.reset();
            }
        }
        draw() {
            const opacity = (this.life / this.maxLife) * 0.8;
            ctx.fillStyle = this.colorPrefix + opacity + ')';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    for (let i = 0; i < particleCount; i++) {
        particles.push(new CyberParticle());
    }

    function animate() {
        requestAnimationFrame(animate);
        ctx.clearRect(0, 0, width, height);

        // Draw Particles
        particles.forEach(p => {
            p.update();
            p.draw();
        });

        // Connect nearby particles for a subtle network effect (optional, adds "tech" feel)
        ctx.lineWidth = 0.5;
        for (let i = 0; i < particles.length; i++) {
            for (let j = i; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 100) {
                    ctx.strokeStyle = `rgba(108, 92, 231, ${0.1 - dist / 1000})`;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
    }

    animate();

    // --- 3D Tilt Effect for Cards ---
    const cards = document.querySelectorAll('.project-card, .skill-card, .resume-card, .certificate-card');

    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            const rotateX = ((y - centerY) / centerY) * -10; // Max rotation deg
            const rotateY = ((x - centerX) / centerX) * 10;

            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';
        });
    });

    // --- Custom Cursor ---
    const cursor = document.querySelector('.cursor');
    const follower = document.querySelector('.cursor-follower');
    const links = document.querySelectorAll('a, button, .project-card, .skill-card, .resume-card, .certificate-card');

    document.addEventListener('mousemove', (e) => {
        cursor.style.left = e.clientX + 'px';
        cursor.style.top = e.clientY + 'px';

        // Small delay for follower
        setTimeout(() => {
            follower.style.left = e.clientX + 'px';
            follower.style.top = e.clientY + 'px';
        }, 50);
    });

    links.forEach(link => {
        link.addEventListener('mouseenter', () => {
            cursor.classList.add('active');
            follower.classList.add('active');
        });
        link.addEventListener('mouseleave', () => {
            cursor.classList.remove('active');
            follower.classList.remove('active');
        });
    });

    // --- Typing Effect (Replaced by Rotating Text below) ---

    // --- Scroll Progress Bar ---
    const progressBar = document.querySelector('.scroll-progress');

    window.addEventListener('scroll', () => {
        const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = (scrollTop / scrollHeight) * 100;
        progressBar.style.width = scrolled + '%';
    });

    // --- Magnetic Buttons & Social Icons ---
    const magneticBtns = document.querySelectorAll('.btn, .social-icon');

    magneticBtns.forEach(btn => {
        btn.classList.add('btn-magnetic'); // Add class for CSS transition

        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;

            btn.style.transform = `translate(${x * 0.5}px, ${y * 0.5}px)`; // Increased strength for icons
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translate(0, 0)';
        });
    });

    // --- Preloader ---
    const preloader = document.getElementById('preloader');

    // Simulate loading time or wait for window load
    window.addEventListener('load', () => {
        setTimeout(() => {
            preloader.classList.add('hidden');
            // Start hero animations after preloader is gone
            document.querySelector('.hero-title').style.animationPlayState = 'running';
        }, 2000); // 2 seconds minimum load time for effect
    });

    // --- Text Reveal Animation for Section Titles ---
    // Wrap section title text in span for reveal effect
    document.querySelectorAll('.section-title').forEach(title => {
        const text = title.textContent;
        title.innerHTML = '';
        const span = document.createElement('span');
        span.textContent = text;
        title.appendChild(span);
        title.classList.add('reveal-text');
    });

    const textRevealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal-text').forEach(text => {
        textRevealObserver.observe(text);
    });

    // --- Parallax Effect for Ambient Lights ---
    window.addEventListener('mousemove', (e) => {
        const lights = document.querySelectorAll('.light-orb');
        const x = e.clientX / window.innerWidth;
        const y = e.clientY / window.innerHeight;

        lights.forEach((light, index) => {
            const speed = (index + 1) * 20;
            const xOffset = (x - 0.5) * speed;
            const yOffset = (y - 0.5) * speed;
            light.style.transform = `translate(${xOffset}px, ${yOffset}px) scale(${1 + (index * 0.1)})`;
        });
    });

    // --- Active Nav Link Highlighter ---
    const sections = document.querySelectorAll('section');
    const navLi = document.querySelectorAll('.nav-links li a');

    window.addEventListener('scroll', () => {
        let current = '';
        const scrollPosition = window.scrollY + 200; // Offset for better triggering

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (scrollPosition >= sectionTop) {
                current = section.getAttribute('id');
            }
        });

        navLi.forEach(a => {
            a.classList.remove('active');
            // Ensure current is not empty before checking
            if (current && a.getAttribute('href').includes(current)) {
                a.classList.add('active');
            }
        });
    });

    // --- Button Ripple Effect ---
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', function (e) {
            let x = e.clientX - e.target.offsetLeft;
            let y = e.clientY - e.target.offsetTop;

            // Handle magnetic offset if present
            const rect = e.target.getBoundingClientRect();
            x = e.clientX - rect.left;
            y = e.clientY - rect.top;

            let ripples = document.createElement('span');
            ripples.style.left = x + 'px';
            ripples.style.top = y + 'px';
            ripples.classList.add('ripple');
            this.appendChild(ripples);

            setTimeout(() => {
                ripples.remove();
            }, 1000);
        });
    });

    // --- Staggered Grid Animations ---
    const staggerObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const children = entry.target.children;
                Array.from(children).forEach((child, index) => {
                    setTimeout(() => {
                        child.classList.add('visible-stagger');
                    }, index * 100); // 100ms delay between each item
                });
                staggerObserver.unobserve(entry.target); // Only animate once
            }
        });
    }, { threshold: 0.2 });

    const grids = document.querySelectorAll('.skills-grid, .projects-grid, .timeline, .certificates-grid');
    grids.forEach(grid => {
        // Hide children initially
        Array.from(grid.children).forEach(child => {
            child.classList.add('hidden-stagger');
        });
        staggerObserver.observe(grid);
    });

    // --- Back to Top Button ---
    const backToTopBtn = document.querySelector('.back-to-top');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            backToTopBtn.classList.add('visible');
        } else {
            backToTopBtn.classList.remove('visible');
        }
    });

    backToTopBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    // --- Spotlight Effect ---
    document.querySelectorAll('.project-card, .skill-card, .resume-card, .certificate-card').forEach(card => {
        card.addEventListener('mousemove', e => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        });
    });

    // --- Simple Typing Effect ---
    const subtitleElement = document.querySelector('.hero-subtitle');
    if (subtitleElement) {
        const textToType = "I am a cybersecurity student.";
        subtitleElement.textContent = ''; // Clear initial text

        let typeIndex = 0;
        function typeText() {
            if (typeIndex < textToType.length) {
                subtitleElement.textContent += textToType.charAt(typeIndex);
                typeIndex++;
                setTimeout(typeText, 50);
            }
        }

        // Start typing after initial animations
        setTimeout(typeText, 1000);
    }

    // --- Confetti Effect on Contact Button ---
    const contactBtn = document.querySelector('.btn-secondary');
    contactBtn.addEventListener('click', (e) => {
        // Simple confetti burst
        for (let i = 0; i < 50; i++) {
            createConfetti(e.clientX, e.clientY);
        }
    });

    function createConfetti(x, y) {
        const confetti = document.createElement('div');
        confetti.style.position = 'fixed';
        confetti.style.width = '10px';
        confetti.style.height = '10px';
        confetti.style.backgroundColor = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#ffffff'][Math.floor(Math.random() * 4)];
        confetti.style.left = x + 'px';
        confetti.style.top = y + 'px';
        confetti.style.borderRadius = '50%';
        confetti.style.pointerEvents = 'none';
        confetti.style.zIndex = '9999';
        document.body.appendChild(confetti);

        const angle = Math.random() * Math.PI * 2;
        const velocity = Math.random() * 5 + 2;
        const dx = Math.cos(angle) * velocity;
        const dy = Math.sin(angle) * velocity;

        let opacity = 1;

        const animateConfetti = () => {
            const currentLeft = parseFloat(confetti.style.left);
            const currentTop = parseFloat(confetti.style.top);

            confetti.style.left = (currentLeft + dx) + 'px';
            confetti.style.top = (currentTop + dy) + 'px';
            opacity -= 0.02;
            confetti.style.opacity = opacity;

            if (opacity > 0) {
                requestAnimationFrame(animateConfetti);
            } else {
                confetti.remove();
            }
        };
        requestAnimationFrame(animateConfetti);
    }

    // --- Skew on Scroll Effect ---
    const scrollContainer = document.querySelector('.scroll-container');
    let currentPos = window.pageYOffset;
    let newPos;
    let skew;

    function skewEffect() {
        // Disable skew in game mode to prevent breaking fixed positioning
        if (document.body.classList.contains('game-mode')) {
            scrollContainer.style.transform = 'none';
            requestAnimationFrame(skewEffect);
            return;
        }

        newPos = window.pageYOffset;
        const diff = newPos - currentPos;
        skew = diff * 0.15; // Sensitivity

        // Cap skew to avoid extreme distortion
        skew = Math.min(Math.max(skew, -10), 10);

        scrollContainer.style.transform = `skewY(${skew}deg)`;

        currentPos = newPos;
        requestAnimationFrame(skewEffect);
    }

    requestAnimationFrame(skewEffect);

    // --- Footer Parallax Adjustment ---
    const footer = document.querySelector('.footer');
    const mainContainer = document.querySelector('.scroll-container');

    function adjustFooter() {
        if (footer && mainContainer) {
            const footerHeight = footer.offsetHeight;
            mainContainer.style.marginBottom = `${footerHeight}px`;
        }
    }

    window.addEventListener('resize', adjustFooter);
    // Use setTimeout to ensure DOM is fully rendered
    setTimeout(adjustFooter, 100);
});
