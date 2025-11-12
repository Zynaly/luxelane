import React from 'react';

const teamMembers = [
  { name: 'Eleanor Vance', role: 'Founder & CEO', imageUrl: 'https://picsum.photos/seed/team1/500/500' },
  { name: 'Marcus Holloway', role: 'Lead Designer', imageUrl: 'https://picsum.photos/seed/team2/500/500' },
  { name: 'Isabelle Rossi', role: 'Head of Operations', imageUrl: 'https://picsum.photos/seed/team3/500/500' },
];

const AboutUsPage: React.FC = () => {
  return (
    <div className="bg-white">
      <main>
        {/* Hero Section */}
        <div className="relative">
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gray-100" />
          <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
            <div className="relative shadow-xl sm:rounded-2xl sm:overflow-hidden">
              <div className="absolute inset-0">
                <img
                  className="h-full w-full object-cover"
                  src="https://picsum.photos/seed/aboutus/1200/600"
                  alt="People working on laptops"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-primary to-indigo-700 mix-blend-multiply" />
              </div>
              <div className="relative px-4 py-16 sm:px-6 sm:py-24 lg:py-32 lg:px-8">
                <h1 className="text-center text-4xl font-serif font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
                  <span className="block text-white">Our Mission</span>
                </h1>
                <p className="mt-6 max-w-lg mx-auto text-center text-xl text-indigo-200 sm:max-w-3xl">
                  To blend timeless design with modern innovation, creating products that are not only beautiful but also built to last. We believe in quality, craftsmanship, and a commitment to our customers.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Our Story Section */}
        <div className="bg-gray-100 py-16 sm:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-serif font-extrabold text-gray-900 sm:text-4xl">Our Story</h2>
              <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-600">
                Founded in 2010, LuxeLane started as a small workshop with a big dream. From our humble beginnings, we've grown into a brand recognized for its dedication to excellence. Every stitch, every detail, and every product is a testament to our journey and our passion for creating the extraordinary.
              </p>
            </div>
          </div>
        </div>
        
        {/* Team Section */}
        <div className="bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-serif font-bold tracking-tight text-gray-900 sm:text-4xl">Meet Our Leadership</h2>
              <p className="mt-4 text-lg leading-8 text-gray-600">
                The creative minds behind our brand, dedicated to bringing you the best.
              </p>
            </div>
            <ul
              role="list"
              className="mx-auto mt-20 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-16 sm:grid-cols-2 lg:mx-0 lg:max-w-none lg:grid-cols-3"
            >
              {teamMembers.map((person) => (
                <li key={person.name} className="text-center">
                  <img className="mx-auto h-56 w-56 rounded-full object-cover" src={person.imageUrl} alt="" />
                  <h3 className="mt-6 text-base font-semibold leading-7 tracking-tight text-gray-900">{person.name}</h3>
                  <p className="text-sm leading-6 text-gray-600">{person.role}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>

      </main>
    </div>
  );
};

export default AboutUsPage;
