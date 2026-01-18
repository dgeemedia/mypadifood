// ==================== JS/SCRIPT.JS - COMPLETE JAVASCRIPT ==================== 

document.addEventListener('DOMContentLoaded', function() {
    
    // ===== MOBILE MENU FUNCTIONALITY =====
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const mobileMenu = document.querySelector('.mobile-menu');
    const mobileMenuClose = document.querySelector('.mobile-menu-close');
    const mobileMenuOverlay = document.querySelector('.mobile-menu-overlay');
    
    // Open mobile menu
    if (mobileMenuToggle && mobileMenu) {
        mobileMenuToggle.addEventListener('click', () => {
            mobileMenu.classList.add('active');
            if (mobileMenuOverlay) mobileMenuOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    }
    
    // Close mobile menu
    function closeMobileMenu() {
        if (mobileMenu) mobileMenu.classList.remove('active');
        if (mobileMenuOverlay) mobileMenuOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    if (mobileMenuClose) {
        mobileMenuClose.addEventListener('click', closeMobileMenu);
    }
    
    if (mobileMenuOverlay) {
        mobileMenuOverlay.addEventListener('click', closeMobileMenu);
    }
    
    // Close mobile menu when clicking on links
    const mobileLinks = document.querySelectorAll('.mobile-nav-links a');
    mobileLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            // Don't close if it's a dropdown trigger
            if (!link.classList.contains('dropdown-toggle')) {
                closeMobileMenu();
            }
        });
    });
    
    // Close menu on ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && mobileMenu && mobileMenu.classList.contains('active')) {
            closeMobileMenu();
        }
    });
    
    
    // ===== SMOOTH SCROLLING =====
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            // Skip if it's just # or #!
            if (href === '#' || href === '#!') return;
            
            const targetId = href.substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                e.preventDefault();
                closeMobileMenu();
                
                const headerOffset = 80;
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
    
    
    // ===== HEADER SCROLL EFFECT =====
    const header = document.getElementById('header');
    
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });
    
    
    // ===== SUBDOMAIN INPUT SYNC & VALIDATION =====
    const subdomainInputs = document.querySelectorAll('.subdomain-input');
    
    subdomainInputs.forEach(input => {
        input.addEventListener('input', function() {
            // Only allow lowercase letters, numbers, and hyphens
            const value = this.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
            this.value = value;
            
            // Sync with contact form subdomain if exists
            const contactSubdomain = document.getElementById('contact-subdomain');
            if (contactSubdomain && contactSubdomain !== this) {
                contactSubdomain.value = value;
            }
        });
        
        // Typing animation for placeholder
        const placeholderText = 'yourbusiness';
        let i = 0;
        
        function typePlaceholder() {
            if (i < placeholderText.length) {
                input.placeholder = placeholderText.substring(0, i + 1);
                i++;
                setTimeout(typePlaceholder, 100);
            }
        }
        
        setTimeout(typePlaceholder, 1000);
    });
    
    
    // ===== FORM HANDLING =====
    const forms = document.querySelectorAll('form');
    
    forms.forEach(form => {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const submitButton = this.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;
            const formData = new FormData(this);
            
            // Show loading state
            submitButton.textContent = 'Sending...';
            submitButton.disabled = true;
            submitButton.style.opacity = '0.7';
            
            try {
                const response = await fetch(this.action, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                
                if (response.ok) {
                    showFormSuccess(this);
                    this.reset();
                } else {
                    throw new Error('Form submission failed');
                }
            } catch (error) {
                showFormError(this, error.message);
            } finally {
                submitButton.textContent = originalText;
                submitButton.disabled = false;
                submitButton.style.opacity = '1';
            }
        });
    });
    
    function showFormSuccess(form) {
        // Remove any existing messages
        const existingMessages = form.parentNode.querySelectorAll('.form-success, .form-error');
        existingMessages.forEach(msg => msg.remove());
        
        const successMessage = document.createElement('div');
        successMessage.className = 'form-success';
        successMessage.innerHTML = `
            <i class="fas fa-check-circle"></i>
            <h3>Thank you!</h3>
            <p>Your message has been sent successfully. We'll contact you within 24 hours.</p>
        `;
        
        form.parentNode.insertBefore(successMessage, form);
        
        // Scroll to success message
        successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Remove success message after 7 seconds
        setTimeout(() => {
            successMessage.style.opacity = '0';
            setTimeout(() => successMessage.remove(), 300);
        }, 7000);
    }
    
    function showFormError(form, error) {
        // Remove any existing messages
        const existingMessages = form.parentNode.querySelectorAll('.form-success, .form-error');
        existingMessages.forEach(msg => msg.remove());
        
        const errorMessage = document.createElement('div');
        errorMessage.className = 'form-error';
        errorMessage.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <h3>Oops! Something went wrong</h3>
            <p>Please try again or contact us directly via WhatsApp.</p>
        `;
        
        form.parentNode.insertBefore(errorMessage, form);
        
        // Remove error message after 7 seconds
        setTimeout(() => {
            errorMessage.style.opacity = '0';
            setTimeout(() => errorMessage.remove(), 300);
        }, 7000);
    }
    
    
    // ===== FORM VALIDATION =====
    forms.forEach(form => {
        const requiredInputs = form.querySelectorAll('[required]');
        
        requiredInputs.forEach(input => {
            input.addEventListener('invalid', function(e) {
                e.preventDefault();
                this.style.borderColor = '#ef4444';
                this.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.1)';
                this.focus();
            });
            
            input.addEventListener('input', function() {
                this.style.borderColor = '#d1d5db';
                this.style.boxShadow = 'none';
            });
            
            // Reset on focus
            input.addEventListener('focus', function() {
                this.style.borderColor = '#10b981';
                this.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.1)';
            });
            
            input.addEventListener('blur', function() {
                if (this.value) {
                    this.style.borderColor = '#d1d5db';
                    this.style.boxShadow = 'none';
                }
            });
        });
    });
    
    
    // ===== BACK TO TOP BUTTON =====
    const backToTop = document.querySelector('.back-to-top');
    
    if (backToTop) {
        window.addEventListener('scroll', () => {
            if (window.pageYOffset > 300) {
                backToTop.style.opacity = '1';
                backToTop.style.visibility = 'visible';
                backToTop.style.transform = 'translateY(0)';
            } else {
                backToTop.style.opacity = '0';
                backToTop.style.visibility = 'hidden';
                backToTop.style.transform = 'translateY(20px)';
            }
        });
        
        backToTop.addEventListener('click', (e) => {
            e.preventDefault();
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
    
    
    // ===== DROPDOWN MENU HANDLING =====
    const dropdowns = document.querySelectorAll('.dropdown');
    
    // Desktop hover
    dropdowns.forEach(dropdown => {
        dropdown.addEventListener('mouseenter', () => {
            if (window.innerWidth > 768) {
                dropdown.classList.add('active');
            }
        });
        
        dropdown.addEventListener('mouseleave', () => {
            if (window.innerWidth > 768) {
                dropdown.classList.remove('active');
            }
        });
        
        // Mobile/Touch devices
        const dropdownLink = dropdown.querySelector('a');
        if (dropdownLink) {
            dropdownLink.addEventListener('click', (e) => {
                if (window.innerWidth <= 768) {
                    e.preventDefault();
                    dropdown.classList.toggle('active');
                }
            });
        }
    });
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) {
            dropdowns.forEach(dropdown => {
                dropdown.classList.remove('active');
            });
        }
    });
    
    
    // ===== ANIMATION ON SCROLL =====
    function initScrollAnimations() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-in');
                    // Optionally unobserve after animation
                    // observer.unobserve(entry.target);
                }
            });
        }, observerOptions);
        
        // Observe elements for animation
        const animateElements = document.querySelectorAll(
            '.feature-card, .step, .ecosystem-card, .testimonial-card, ' +
            '.value-card, .contact-method-card, .blog-card, .job-card'
        );
        
        animateElements.forEach(el => {
            observer.observe(el);
        });
    }
    
    initScrollAnimations();
    
    
    // ===== FAQ FUNCTIONALITY =====
    function initFAQ() {
        const faqItems = document.querySelectorAll('.faq-item');
        
        if (faqItems.length === 0) return;
        
        faqItems.forEach(item => {
            const question = item.querySelector('.faq-question');
            const answer = item.querySelector('.faq-answer');
            
            if (question && answer) {
                question.addEventListener('click', (e) => {
                    // Don't trigger if clicking on a link
                    if (e.target.tagName === 'A') return;
                    
                    const isActive = item.classList.contains('active');
                    
                    // Close all other FAQ items (accordion behavior)
                    faqItems.forEach(otherItem => {
                        if (otherItem !== item) {
                            otherItem.classList.remove('active');
                            const otherAnswer = otherItem.querySelector('.faq-answer');
                            if (otherAnswer) otherAnswer.style.maxHeight = null;
                        }
                    });
                    
                    // Toggle current item
                    if (!isActive) {
                        item.classList.add('active');
                        answer.style.maxHeight = answer.scrollHeight + 'px';
                    } else {
                        item.classList.remove('active');
                        answer.style.maxHeight = null;
                    }
                });
                
                // Set initial state for active items
                if (item.classList.contains('active')) {
                    answer.style.maxHeight = answer.scrollHeight + 'px';
                }
            }
        });
    }
    
    initFAQ();
    
    
    // ===== RESOURCES PAGE NAVIGATION =====
    if (document.querySelector('.resources-nav')) {
        initResourcesNavigation();
    }
    
    function initResourcesNavigation() {
        const resourceLinks = document.querySelectorAll('.resources-nav a');
        const sections = document.querySelectorAll('.resource-section');
        
        if (resourceLinks.length === 0) return;
        
        // Smooth scroll for resource navigation
        resourceLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                
                // Remove active class from all links
                resourceLinks.forEach(l => l.classList.remove('active'));
                
                // Add active class to clicked link
                this.classList.add('active');
                
                // Get target section
                const targetId = this.getAttribute('href');
                const targetSection = document.querySelector(targetId);
                
                if (targetSection) {
                    const headerOffset = 120;
                    const elementPosition = targetSection.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                    
                    window.scrollTo({
                        top: offsetPosition,
                        behavior: 'smooth'
                    });
                }
            });
        });
        
        // Update active nav link on scroll
        window.addEventListener('scroll', () => {
            if (sections.length === 0) return;
            
            const scrollPosition = window.scrollY + 150;
            let currentSectionId = '';
            
            sections.forEach(section => {
                const sectionTop = section.offsetTop;
                const sectionHeight = section.clientHeight;
                
                if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                    currentSectionId = section.getAttribute('id');
                }
            });
            
            if (currentSectionId) {
                resourceLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${currentSectionId}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }
    
    
    // ===== WHATSAPP INTEGRATION =====
    function setupWhatsAppIntegration() {
        const whatsappLinks = document.querySelectorAll('a[href*="wa.me"]');
        
        whatsappLinks.forEach(link => {
            link.addEventListener('click', function() {
                // Optional: Add analytics tracking here
                console.log('WhatsApp link clicked:', this.href);
            });
        });
    }
    
    setupWhatsAppIntegration();
    
    
    // ===== NUMBER COUNTER ANIMATION =====
    function animateCounter(element, target, duration = 2000) {
        const start = 0;
        const increment = target / (duration / 16);
        let current = start;
        
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                element.textContent = target;
                clearInterval(timer);
            } else {
                element.textContent = Math.floor(current);
            }
        }, 16);
    }
    
    // Observe stat cards and animate when visible
    const statCards = document.querySelectorAll('.stat-value');
    if (statCards.length > 0) {
        const statObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !entry.target.dataset.animated) {
                    const value = entry.target.textContent.replace(/[^0-9]/g, '');
                    if (value) {
                        entry.target.dataset.animated = 'true';
                        animateCounter(entry.target, parseInt(value));
                    }
                }
            });
        }, { threshold: 0.5 });
        
        statCards.forEach(card => statObserver.observe(card));
    }
    
    
    // ===== ANIMATE DASHBOARD STATS =====
    function animateDashboardStats() {
        const stats = document.querySelectorAll('.stat-card');
        
        // If no stats found, return
        if (stats.length === 0) return;
        
        // Set initial state for all stat cards
        stats.forEach((stat) => {
            stat.style.opacity = '0';
            stat.style.transform = 'translateY(20px)';
            stat.style.transition = 'none';
        });
        
        // Animate each stat card with delay
        stats.forEach((stat, index) => {
            setTimeout(() => {
                stat.style.transition = 'all 0.5s ease-out';
                stat.style.opacity = '1';
                stat.style.transform = 'translateY(0)';
            }, index * 200);
        });
    }
    
    // Animate dashboard stats when hero section is in view
    const heroVisual = document.querySelector('.hero-visual');
    if (heroVisual) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    animateDashboardStats();
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.3 });
        
        observer.observe(heroVisual);
    }
    
    
    // ===== PARALLAX EFFECT (SUBTLE) =====
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const parallaxElements = document.querySelectorAll('.hero::before');
        
        parallaxElements.forEach(el => {
            el.style.transform = `translateY(${scrolled * 0.5}px)`;
        });
    });
    
    
    // ===== LOADING ANIMATION =====
    window.addEventListener('load', () => {
        document.body.classList.add('loaded');
        
        // Trigger animations for elements in viewport
        const elementsToAnimate = document.querySelectorAll(
            '.hero-content, .hero-visual, .feature-card, .section-title'
        );
        
        elementsToAnimate.forEach((el, index) => {
            setTimeout(() => {
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            }, index * 100);
        });
    });
    
    
    // ===== CONSOLE MESSAGE =====
    console.log('%c🍔 MyPadiFood ', 'background: #10b981; color: white; font-size: 20px; padding: 10px;');
    console.log('%cLooking for developers? Check out our careers page!', 'color: #6366f1; font-size: 14px;');
    
});


// ===== UTILITY FUNCTIONS =====

// Debounce function for performance
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle function for scroll events
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Check if element is in viewport
function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

// Format currency
function formatCurrency(amount, currency = '₦') {
    return currency + amount.toLocaleString();
}

// Validate email
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Validate phone number (Nigerian format)
function isValidPhone(phone) {
    const re = /^(\+?234|0)[789]\d{9}$/;
    return re.test(phone.replace(/\s/g, ''));
}