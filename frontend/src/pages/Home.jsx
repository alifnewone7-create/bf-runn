import React from 'react';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import HowItWorks from '../components/HowItWorks';
import Challenges from '../components/Challenges';
import QuotexSection from '../components/QuotexSection';
import Features from '../components/Features';
import Testimonials from '../components/Testimonials';
import FAQ from '../components/FAQ';
import CTA from '../components/CTA';
import Footer from '../components/Footer';

const Home = () => (
  <div className="min-h-screen">
    <Navbar />
    <main>
      <Hero />
      <HowItWorks />
      <Challenges />
      <QuotexSection />
      <Features />
      <Testimonials />
      <FAQ />
      <CTA />
    </main>
    <Footer />
  </div>
);

export default Home;
