import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Sprout,
  Activity,
  Layout,
  Droplets,
  ShieldCheck,
  Smartphone,
  Users,
  Shuffle,
  BarChart3,
  Eye,
  TrendingUp,
  ClipboardCheck,
  LineChart,
  ArrowRight,
  Globe,
  Github,
  Linkedin,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import heroRice from '../assets/hero-rice.png';

const Landing = () => {
  const shouldReduceMotion = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [navScrolled, setNavScrolled] = useState(false);
  const Motion = motion;

  const NAVBAR_HEIGHT_PX = 64;

  useEffect(() => {
    const onScroll = () => {
      setNavScrolled(window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const heroTextVariants = shouldReduceMotion
    ? {
        hidden: { opacity: 1, y: 0 },
        visible: { opacity: 1, y: 0 },
      }
    : {
        hidden: { opacity: 0, y: 24 },
        visible: { opacity: 1, y: 0 },
      };

  const sectionVariants = shouldReduceMotion
    ? {
        hidden: { opacity: 1, y: 0 },
        visible: { opacity: 1, y: 0 },
      }
    : {
        hidden: { opacity: 0, y: 24 },
        visible: { opacity: 1, y: 0 },
      };

  const featuresContainer = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.12,
      },
    },
  };

  const featureItem = shouldReduceMotion
    ? {
        hidden: { opacity: 1, y: 0 },
        visible: { opacity: 1, y: 0 },
      }
    : {
        hidden: { opacity: 0, y: 16 },
        visible: { opacity: 1, y: 0 },
      };

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Fixed navigation — full width, always visible */}
      <Motion.nav
        initial={shouldReduceMotion ? {} : { opacity: 0, y: -8 }}
        animate={shouldReduceMotion ? {} : { opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className={[
          'fixed top-0 left-0 right-0 z-100 h-16 w-full transition-[background-color,box-shadow,border-color,backdrop-filter] duration-300 ease-out',
          navScrolled
            ? 'bg-white/95 shadow-md border-b border-gray-200/80 backdrop-blur-md'
            : 'bg-transparent shadow-none border-b border-transparent',
        ].join(' ')}
        style={{ minHeight: NAVBAR_HEIGHT_PX }}
        aria-label="Primary"
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 md:px-10">
          <div className="flex items-center gap-2">
            <span
              className={[
                'text-xl font-bold tracking-tight transition-colors duration-300',
                navScrolled ? 'text-green-900' : 'text-green-900 drop-shadow-sm',
              ].join(' ')}
            >
              AgriTrack
            </span>
          </div>

          <div className="hidden items-center gap-8 md:flex">
            <a
              href="#"
              className="text-sm font-semibold text-green-900 border-b-2 border-green-700 pb-1"
            >
              Home
            </a>
            <a
              href="#features"
              className="text-sm font-semibold text-green-800 hover:text-green-900 transition-colors"
            >
              Features
            </a>
            <a
              href="#workflow"
              className="text-sm font-semibold text-green-800 hover:text-green-900 transition-colors"
            >
              Crop Stages
            </a>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex">
              <Link
                to="/login"
                className="px-5 py-2.5 text-sm font-semibold bg-green-800 hover:bg-green-900 text-white rounded-xl transition-colors duration-200"
              >
                Get Started
              </Link>
            </div>

            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-2 text-green-900 hover:bg-black/5 md:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="landing-mobile-menu"
            >
              <span className="sr-only">Toggle menu</span>
              <svg className="h-6 w-6" viewBox="0 0 24 24" stroke="currentColor" fill="none">
                <path d="M4 6h16M4 12h16M4 18h16" strokeWidth={2} strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <Motion.div
              id="landing-mobile-menu"
              initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="absolute left-0 right-0 top-full border-t border-gray-200 bg-white shadow-lg md:hidden"
            >
              <div className="mx-auto max-w-7xl px-4 py-3 space-y-2">
                <a
                  href="#"
                  onClick={closeMenu}
                  className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Home
                </a>
                <a
                  href="#features"
                  onClick={closeMenu}
                  className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Features
                </a>
                <a
                  href="#workflow"
                  onClick={closeMenu}
                  className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Crop Stages
                </a>

                <div className="pt-2">
                  <Link
                    to="/login"
                    onClick={closeMenu}
                    className="block text-center rounded-md bg-green-800 px-4 py-2 text-sm font-semibold text-white hover:bg-green-900"
                  >
                    Get Started
                  </Link>
                </div>
              </div>
            </Motion.div>
          )}
        </AnimatePresence>
      </Motion.nav>

      {/* SECTION 1 - HERO */}
      <section
        className="relative w-full min-h-[60vh] sm:min-h-[70vh] lg:min-h-screen overflow-hidden"
        style={{ paddingTop: NAVBAR_HEIGHT_PX }}
      >
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroRice})` }}
        />

        {/* Overlay for readable text */}
        <div className="absolute inset-0 bg-green-950/45" />

        {/* Hero Content */}
        <div className="relative z-10 flex flex-1 items-center">
          <Motion.div
            variants={heroTextVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: false, amount: 0.6 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="w-full max-w-3xl px-4 sm:px-6 lg:px-10 text-left space-y-6 py-16 sm:py-20 lg:py-24"
          >
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-white tracking-tight leading-[0.95] drop-shadow-md">
              AgriTrack: Smart
              <br />
              Farming for Every
              <br />
              Crop
            </h1>
            
            <p className="text-base md:text-2xl text-green-100 max-w-2xl leading-relaxed">
              Optimizing harvest through data-driven insights and
              real-time monitoring. Experience the digital
              transformation of traditional rice cultivation
            </p>
            
            <div className="flex w-full max-w-md flex-row gap-3 pt-4 sm:max-w-none sm:w-auto sm:gap-4 sm:items-center">
              <Motion.div whileHover={shouldReduceMotion ? {} : { scale: 1.03 }} whileTap={shouldReduceMotion ? {} : { scale: 0.97 }}>
                <Link
                  to="/login"
                  className="inline-flex h-12 flex-1 items-center justify-center rounded-xl bg-white px-8 text-base font-semibold text-green-900 shadow-lg transition-all duration-200 hover:bg-green-50 sm:flex-none"
                >
                  Get Started
                </Link>
              </Motion.div>
              <a
                href="#features"
                className="inline-flex h-12 flex-1 items-center justify-center rounded-xl border border-white/80 px-8 text-base font-semibold text-white transition-all duration-200 hover:bg-white hover:text-green-900 sm:flex-none"
              >
                Learn More
              </a>
            </div>
          </Motion.div>
        </div>
      </section>

      {/* SECTION 2 - FEATURES */}
      <Motion.section
        id="features"
        className="py-24 bg-emerald-50/60"
        
      >
        <div className="container mx-auto px-6 max-w-6xl">
          <h2 className="text-3xl md:text-4xl font-extrabold text-green-900 text-center">
            Everything you need to manage your crop
          </h2>
          <p className="text-center text-gray-500 text-sm md:text-base mt-3 mb-12 max-w-2xl mx-auto">
            Empower your agricultural operations with data-driven insights and
            precision management tools.
          </p>
          
          <Motion.div
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={featuresContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: false, amount: 0.2 }}
          >
            <Motion.div
              className="bg-white/80 border border-white/60 rounded-2xl p-7 shadow-sm transition-all duration-200 group hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-emerald-200/60"
              variants={featureItem}
            >
              <div className="w-11 h-11 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center mb-4 border border-emerald-100">
                <Sprout size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Planting Tracker</h3>
              <p className="text-gray-600 text-sm leading-relaxed">Log and monitor every planting from seeding to harvest stage</p>
            </Motion.div>
            
            <Motion.div
              className="bg-white/80 border border-white/60 rounded-2xl p-7 shadow-sm transition-all duration-200 group hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-emerald-200/60"
              variants={featureItem}
            >
              <div className="w-11 h-11 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center mb-4 border border-emerald-100">
                <Activity size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Activity Logger</h3>
              <p className="text-gray-600 text-sm leading-relaxed">Record all farm activities — fertilizing, irrigation, pest control and more</p>
            </Motion.div>
            
            <Motion.div
              className="bg-white/80 border border-white/60 rounded-2xl p-7 shadow-sm transition-all duration-200 group hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-emerald-200/60"
              variants={featureItem}
            >
              <div className="w-11 h-11 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center mb-4 border border-emerald-100">
                <Layout size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Harvest Analytics</h3>
              <p className="text-gray-600 text-sm leading-relaxed">Track yield per season and predict outcomes based on historical data</p>
            </Motion.div>
            
            <Motion.div
              className="bg-white/80 border border-white/60 rounded-2xl p-7 shadow-sm transition-all duration-200 group hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-emerald-200/60"
              variants={featureItem}
            >
              <div className="w-11 h-11 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center mb-4 border border-emerald-100">
                <Droplets size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Weather-aware</h3>
              <p className="text-gray-600 text-sm leading-relaxed">Plan activities based on wet and dry season crop cycles</p>
            </Motion.div>
            
            <Motion.div
              className="bg-white/80 border border-white/60 rounded-2xl p-7 shadow-sm transition-all duration-200 group hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-emerald-200/60"
              variants={featureItem}
            >
              <div className="w-11 h-11 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center mb-4 border border-emerald-100">
                <ShieldCheck size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Role-based Access</h3>
              <p className="text-gray-600 text-sm leading-relaxed">Admin, Manager, and Farmer roles with controlled permissions</p>
            </Motion.div>
            
            <Motion.div
              className="bg-white/80 border border-white/60 rounded-2xl p-7 shadow-sm transition-all duration-200 group hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-emerald-200/60"
              variants={featureItem}
            >
              <div className="w-11 h-11 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center mb-4 border border-emerald-100">
                <Smartphone size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Easy to Use</h3>
              <p className="text-gray-600 text-sm leading-relaxed">Simple interface designed for farmers and agronomists alike</p>
            </Motion.div>
          </Motion.div>
        </div>
      </Motion.section>

      {/* SECTION 3 - CROP STAGES */}
      <Motion.section
        id="workflow"
        className="py-24 bg-[#f6f7f1] overflow-hidden relative"
        variants={sectionVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: false, amount: 0.2 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-12">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-green-900/60 uppercase">
              Real-time cycle monitoring
            </p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-green-950 mt-2">
              Strategic Growth Lifecycle
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                n: '01',
                title: 'Land Prep',
                desc: 'Soil health analytics and data-driven foundation prep.',
                Icon: Users,
                active: false,
              },
              {
                n: '02',
                title: 'Seeding',
                desc: 'Resource allocation and precision planting optimization.',
                Icon: Sprout,
                active: false,
              },
              {
                n: '03',
                title: 'Transplanting',
                desc: 'Logistics management and field operation scaling.',
                Icon: Shuffle,
                active: false,
              },
              {
                n: '04',
                title: 'Tillering',
                desc: 'Real-time nutrient optimization and growth analytics.',
                Icon: LineChart,
                active: true,
                metaLeft: 'PROCESSING DATA',
                metaRight: '84% COMPLETE',
              },
              {
                n: '05',
                title: 'Booting',
                desc: 'Predictive yield forecasting and output modeling.',
                Icon: BarChart3,
                active: false,
              },
              {
                n: '06',
                title: 'Heading',
                desc: 'Data-driven performance review and field status monitoring.',
                Icon: Eye,
                active: false,
              },
              {
                n: '07',
                title: 'Ripening',
                desc: 'Quality metric tracking and ROI analysis.',
                Icon: TrendingUp,
                active: false,
              },
              {
                n: '08',
                title: 'Harvested',
                desc: 'Strategic cycle completion and ERP data archiving.',
                Icon: ClipboardCheck,
                active: false,
              },
            ].map((s) => (
              <div
                key={s.n}
                className={[
                  'rounded-2xl border transition-all duration-200 will-change-transform',
                  s.active
                    ? 'bg-linear-to-br from-green-950 to-green-800 border-green-900 shadow-lg shadow-green-950/20'
                    : 'bg-white/60 border-white/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:ring-2 hover:ring-green-900/10',
                ].join(' ')}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className={s.active ? 'text-2xl font-extrabold tracking-tight text-white/40' : 'text-2xl font-extrabold tracking-tight text-green-950/35'}>
                      {s.n}
                    </div>
                    <div
                      className={[
                        'w-10 h-10 rounded-xl flex items-center justify-center border',
                        s.active
                          ? 'bg-white/10 border-white/20'
                          : 'bg-emerald-50 border-emerald-100',
                      ].join(' ')}
                      aria-hidden="true"
                    >
                      <s.Icon
                        size={18}
                        className={s.active ? 'text-amber-300' : 'text-emerald-800'}
                        strokeWidth={2}
                      />
                    </div>
                  </div>

                  <div className={s.active ? 'mt-4 text-white' : 'mt-4 text-green-950'}>
                    <h3 className="text-lg font-bold">{s.title}</h3>
                    <p className={s.active ? 'text-sm text-white/80 mt-2' : 'text-sm text-gray-600 mt-2'}>
                      {s.desc}
                    </p>
                  </div>
                </div>

                <div className={s.active ? 'px-6 pb-6' : 'px-6 pb-6'}>
                  <div className={s.active ? 'h-1.5 rounded-full bg-white/15 overflow-hidden' : 'h-1 rounded-full bg-green-900/15 overflow-hidden'}>
                    <div
                      className={s.active ? 'h-full bg-white/80' : 'h-full bg-green-900/40'}
                      style={{ width: s.active ? '84%' : '70%' }}
                    />
                  </div>

                  {s.active && (
                    <div className="flex items-center justify-between mt-3 text-[10px] font-semibold tracking-wider text-white/70">
                      <span>{s.metaLeft}</span>
                      <span>{s.metaRight}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Motion.section>

      {/* SECTION 4 - CTA */}
      <Motion.section
        id="cta"
        className="py-16 md:py-24 bg-[#f6f7f1]"
        variants={sectionVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: false, amount: 0.3 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="container mx-auto max-w-5xl px-6">
          <div className="relative overflow-hidden rounded-4xl shadow-2xl shadow-green-950/25 border border-white/10">
            <div className="absolute inset-0 bg-linear-to-br from-[#1b431c] via-green-900 to-[#143218]" />
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.12]"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(90deg, transparent 0, transparent 48px, rgba(255,255,255,0.08) 48px, rgba(255,255,255,0.08) 49px)',
              }}
            />
            <div className="absolute inset-0 bg-white/5 backdrop-blur-[2px]" />
            <div className="relative z-10 px-8 py-12 md:px-14 md:py-16 text-center">
              <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
                Ready to Transform Your Farm?
              </h2>
              <p className="mt-4 text-base md:text-lg text-white/90 max-w-2xl mx-auto leading-relaxed font-medium">
                Join over 12,000 farmers using AgriTrack to increase yields and reduce operational costs. Start your 14-day free trial today.
              </p>
              <Motion.div
                className="mt-10"
                whileHover={shouldReduceMotion ? {} : { scale: 1.02 }}
                whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
              >
                <Link
                  to="/login"
                  className="inline-block rounded-xl bg-[#ffb845] px-10 py-3.5 text-sm font-extrabold uppercase tracking-[0.2em] text-black shadow-lg shadow-black/20 transition-all duration-200 hover:bg-[#ffc860]"
                >
                  Get started now
                </Link>
              </Motion.div>
            </div>
          </div>
        </div>
      </Motion.section>

      {/* SECTION 5 - FOOTER */}
      <footer className="bg-[#F9F9F7] border-t border-gray-200/80">
        <div className="container mx-auto max-w-6xl px-6 py-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-12 lg:gap-10">
            <div className="sm:col-span-2 lg:col-span-1 max-w-sm">
              <span className="text-xl font-bold text-[#2D5430] tracking-tight">AgriTrack</span>
              <p className="mt-4 text-sm leading-relaxed text-[#4A4A4A]">
                The intelligent ERP for modern agriculture. We provide the data-driven tools farmers need to thrive in a rapidly changing world.
              </p>
              <p className="mt-5 text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.12em] italic text-[#89A48C] leading-snug">
                Empowering Philippine rice farmers with smart data
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <a
                  href="https://twitter.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gray-200/80 px-3 py-2 text-xs font-medium text-[#4A4A4A] hover:bg-gray-300/90 transition-colors"
                >
                  <Globe size={14} className="text-[#2D5430]" strokeWidth={2} />
                  <span>X</span>
                </a>
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gray-200/80 px-3 py-2 text-xs font-medium text-[#4A4A4A] hover:bg-gray-300/90 transition-colors"
                >
                  <Github size={14} className="text-[#2D5430]" strokeWidth={2} />
                  GitHub
                </a>
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gray-200/80 px-3 py-2 text-xs font-medium text-[#4A4A4A] hover:bg-gray-300/90 transition-colors"
                >
                  <Linkedin size={14} className="text-[#2D5430]" strokeWidth={2} />
                  LinkedIn
                </a>
              </div>
            </div>

            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#2D5430] mb-5">Quick links</h4>
              <ul className="space-y-3 text-sm text-[#4A4A4A]">
                <li><a href="#features" className="hover:text-[#2D5430] transition-colors">Solutions</a></li>
                <li><a href="#workflow" className="hover:text-[#2D5430] transition-colors">How it Works</a></li>
                <li><a href="#workflow" className="hover:text-[#2D5430] transition-colors">Sustainability</a></li>
                <li><a href="#features" className="hover:text-[#2D5430] transition-colors">Case Studies</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#2D5430] mb-5">Support</h4>
              <ul className="space-y-3 text-sm text-[#4A4A4A]">
                <li><a href="#cta" className="hover:text-[#2D5430] transition-colors">Help Center</a></li>
                <li><a href="#cta" className="hover:text-[#2D5430] transition-colors">Documentation</a></li>
                <li><a href="#cta" className="hover:text-[#2D5430] transition-colors">API Status</a></li>
                <li><a href="#cta" className="hover:text-[#2D5430] transition-colors">Contact Sales</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#2D5430] mb-5">Legal</h4>
              <ul className="space-y-3 text-sm text-[#4A4A4A]">
                <li><a href="#cta" className="hover:text-[#2D5430] transition-colors">Privacy Policy</a></li>
                <li><a href="#cta" className="hover:text-[#2D5430] transition-colors">Terms of Service</a></li>
                <li><a href="#cta" className="hover:text-[#2D5430] transition-colors">Cookie Policy</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#2D5430] mb-5">Rice farming insights</h4>
              <p className="text-sm text-[#4A4A4A] leading-relaxed mb-5">
                Get the latest seasonal tips and farm management updates directly in your inbox.
              </p>
              <form
                className="flex rounded-lg overflow-hidden border border-gray-200/90 bg-white shadow-sm max-w-full"
                onSubmit={(e) => e.preventDefault()}
              >
                <input
                  type="email"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  placeholder="Enter your work email"
                  className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-[#4A4A4A] placeholder:text-gray-400 outline-none"
                />
                <button
                  type="submit"
                  className="shrink-0 bg-[#2D5430] px-3.5 py-2.5 text-white hover:bg-[#244428] transition-colors"
                  aria-label="Subscribe"
                >
                  <ArrowRight size={18} className="mx-auto" strokeWidth={2} />
                </button>
              </form>
            </div>
          </div>

          <div className="mt-14 pt-8 border-t border-gray-200/80 flex flex-col md:flex-row md:items-end md:justify-between gap-8">
            <p className="text-xs text-gray-400">
              © {new Date().getFullYear()} AgriTrack. Cultivating the Future.
            </p>
            <div className="text-right md:text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">Core values</p>
              <p className="mt-2 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.35em] text-gray-400">
                Precision<span className="mx-2 sm:mx-4" />Growth<span className="mx-2 sm:mx-4" />Sustainability
              </p>
            </div>
          </div>
        </div>
      </footer>
      
    </div>
  );
};

export default Landing;
