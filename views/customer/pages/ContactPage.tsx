import React from 'react';
import { Icon } from '../../../components/Icon';

const ContactPage: React.FC<{ onOpenChat: () => void }> = ({ onOpenChat }) => (
    <div className="bg-white py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
                <h1 className="text-4xl font-serif font-bold tracking-tight text-dark sm:text-5xl">Get in Touch</h1>
                <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-600">
                    We're here to help! Choose a contact method below that best suits your needs.
                </p>
            </div>
            <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
                <div className="p-8 border border-gray-200 rounded-lg shadow-sm hover:shadow-lg transition-shadow">
                    <div className="inline-flex items-center justify-center p-4 bg-blue-100 rounded-full mb-4">
                        <Icon name="chat-bubble" className="w-8 h-8 text-primary" />
                    </div>
                    <h2 className="text-2xl font-bold font-serif text-dark">Live Chat</h2>
                    <p className="mt-2 text-gray-600">Get instant answers from our support chatbot. Available 24/7.</p>
                    <button onClick={onOpenChat} className="mt-6 bg-primary text-white font-semibold py-2 px-6 rounded-full hover:bg-primary-hover transition-colors">
                        Start Chat
                    </button>
                </div>
                 <div className="p-8 border border-gray-200 rounded-lg shadow-sm hover:shadow-lg transition-shadow">
                    <div className="inline-flex items-center justify-center p-4 bg-green-100 rounded-full mb-4">
                        <Icon name="phone" className="w-8 h-8 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-bold font-serif text-dark">Call an Agent</h2>
                    <p className="mt-2 text-gray-600">Speak directly with one of our friendly support agents.</p>
                    <p className="text-sm text-gray-500 mt-1">Mon-Fri, 9am - 5pm EST</p>
                    <a href="tel:+1-800-555-0123" className="mt-6 inline-block bg-green-600 text-white font-semibold py-2 px-6 rounded-full hover:bg-green-700 transition-colors">
                       Call +1-800-555-0123
                    </a>
                </div>
                 <div className="p-8 border border-gray-200 rounded-lg shadow-sm hover:shadow-lg transition-shadow">
                     <div className="inline-flex items-center justify-center p-4 bg-gray-100 rounded-full mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    </div>
                    <h2 className="text-2xl font-bold font-serif text-dark">Email Support</h2>
                    <p className="mt-2 text-gray-600">Send us an email and we'll get back to you within 24 hours.</p>
                    <a href="mailto:support@luxelane.com" className="mt-6 inline-block text-primary font-semibold hover:underline">
                       support@luxelane.com
                    </a>
                </div>
            </div>
        </div>
    </div>
);

export default ContactPage;
