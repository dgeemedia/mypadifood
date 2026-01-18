// script.js - Main JavaScript with all functionality

document.addEventListener('DOMContentLoaded', function() {
    // Mobile Menu Toggle
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
    const mobileMenu = document.querySelector('.mobile-menu');
    const mobileMenuClose = document.querySelector('.mobile-menu-close');
    const mobileMenuOverlay = document.querySelector('.mobile-menu-overlay');
    
    if (mobileMenuToggle && mobileMenu) {
        mobileMenuToggle.addEventListener('click', () => {
            mobileMenu.classList.add('active');
            if (mobileMenuOverlay) mobileMenuOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    }
    
    if (mobileMenuClose) {
        mobileMenuClose.addEventListener('click', closeMobileMenu);
    }
    
    if (mobileMenuOverlay) {
        mobileMenuOverlay.addEventListener('click', closeMobileMenu);
    }
    
    function closeMobileMenu() {
        if (mobileMenu) mobileMenu.classList.remove('active');
        if (mobileMenuOverlay) mobileMenuOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    // Close mobile menu when clicking on a link
    const mobileLinks = document.querySelectorAll('.mobile-nav-links a');
    mobileLinks.forEach(link => {
        link.addEventListener('click', closeMobileMenu);
    });
    
    // Smooth Scrolling
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            if (this.getAttribute('href') === '#' || this.getAttribute('href') === '#!') return;
            
            const targetId = this.getAttribute('href');
            if (targetId.startsWith('#')) {
                e.preventDefault();
                
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    closeMobileMenu();
                    
                    window.scrollTo({
                        top: targetElement.offsetTop - 80,
                        behavior: 'smooth'
                    });
                }
            }
        });
    });
    
    // Subdomain Input Sync
    const subdomainInputs = document.querySelectorAll('.subdomain-input');
    
    subdomainInputs.forEach(input => {
        input.addEventListener('input', function() {
            const value = this.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
            this.value = value;
            
            // Sync with contact form subdomain if exists
            const contactSubdomain = document.getElementById('contact-subdomain');
            if (contactSubdomain && contactSubdomain !== this) {
                contactSubdomain.value = value;
            }
        });
        
        // Add placeholder animation
        const placeholderText = 'yourbusiness';
        let i = 0;
        
        function typePlaceholder() {
            if (i < placeholderText.length) {
                input.placeholder = placeholderText.substring(0, i + 1);
                i++;
                setTimeout(typePlaceholder, 100);
            }
        }
        
        // Start typing effect after 1 second
        setTimeout(typePlaceholder, 1000);
    });
    
    // Form Handling
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
            
            try {
                // Using Formspree for form submission
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
            }
        });
    });
    
    function showFormSuccess(form) {
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
        
        // Remove success message after 5 seconds
        setTimeout(() => {
            successMessage.remove();
        }, 5000);
    }
    
    function showFormError(form, error) {
        const errorMessage = document.createElement('div');
        errorMessage.className = 'form-error';
        errorMessage.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <h3>Oops! Something went wrong</h3>
            <p>Please try again or contact us directly via WhatsApp.</p>
        `;
        
        form.parentNode.insertBefore(errorMessage, form);
        
        // Remove error message after 5 seconds
        setTimeout(() => {
            errorMessage.remove();
        }, 5000);
    }
    
    // Back to Top Button
    const backToTop = document.querySelector('.back-to-top');
    
    if (backToTop) {
        window.addEventListener('scroll', () => {
            if (window.pageYOffset > 300) {
                backToTop.style.opacity = '1';
                backToTop.style.visibility = 'visible';
            } else {
                backToTop.style.opacity = '0';
                backToTop.style.visibility = 'hidden';
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
    
    // WhatsApp Integration Helper
    function setupWhatsAppIntegration() {
        const whatsappLinks = document.querySelectorAll('a[href*="wa.me"]');
        
        whatsappLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                // Optional: Add analytics tracking here
                console.log('WhatsApp link clicked:', this.href);
            });
        });
    }
    
    setupWhatsAppIntegration();
    
    // Initialize animations
    initAnimations();
    
    function initAnimations() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-in');
                }
            });
        }, observerOptions);
        
        // Observe elements for animation
        document.querySelectorAll('.feature-card, .step, .ecosystem-card, .testimonial-card').forEach(el => {
            observer.observe(el);
        });
    }
    
    // Dropdown menu handling for desktop
    const dropdowns = document.querySelectorAll('.dropdown');
    
    dropdowns.forEach(dropdown => {
        dropdown.addEventListener('mouseenter', () => {
            dropdown.classList.add('active');
        });
        
        dropdown.addEventListener('mouseleave', () => {
            dropdown.classList.remove('active');
        });
        
        // For touch devices on desktop dropdowns
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
    
    // Form validation
    function validateForm(form) {
        const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');
        let isValid = true;
        
        inputs.forEach(input => {
            if (!input.value.trim()) {
                isValid = false;
                input.style.borderColor = '#ef4444';
                
                input.addEventListener('input', function() {
                    this.style.borderColor = '#d1d5db';
                }, { once: true });
            }
        });
        
        return isValid;
    }
    
    // Add validation to all forms
    forms.forEach(form => {
        const requiredInputs = form.querySelectorAll('[required]');
        
        requiredInputs.forEach(input => {
            input.addEventListener('invalid', function(e) {
                e.preventDefault();
                this.style.borderColor = '#ef4444';
                this.focus();
            });
            
            input.addEventListener('input', function() {
                this.style.borderColor = '#d1d5db';
            });
        });
    });
    
    // Initialize FAQ Functionality
    initFAQ();
    
    // Resources Page Specific Functionality
    if (document.querySelector('.resources-nav')) {
        initResourcesNavigation();
    }
});

// FAQ Functionality
function initFAQ() {
    const faqItems = document.querySelectorAll('.faq-item');
    
    if (faqItems.length === 0) return;
    
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        const answer = item.querySelector('.faq-answer');
        const toggle = item.querySelector('.faq-toggle');
        
        if (question && answer) {
            // Add click event to the entire question div
            question.addEventListener('click', (e) => {
                // Don't trigger if clicking on a link inside the question
                if (e.target.tagName === 'A') return;
                
                // Toggle current item
                const isActive = item.classList.contains('active');
                
                // Close all other FAQ items (optional - can remove for accordion)
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
                    answer.style.maxHeight = answer.scrollHeight + "px";
                } else {
                    item.classList.remove('active');
                    answer.style.maxHeight = null;
                }
            });
            
            // Set initial state for active items
            if (item.classList.contains('active')) {
                answer.style.maxHeight = answer.scrollHeight + "px";
            }
        }
    });
}

// Resources Page Navigation
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
                // Scroll to section
                window.scrollTo({
                    top: targetSection.offsetTop - 120,
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