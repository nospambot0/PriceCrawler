'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type Game = {
  _id?: string;
  id?: string;
  title: string;
  provider: string;
  category: string;
  thumbnail?: string;
  slug?: string;
};

const demoGames: Game[] = [
  { id: '1', title: 'Mega Fortune', provider: 'NetEnt', category: 'slots', thumbnail: '🎰', slug: 'mega-fortune' },
  { id: '2', title: 'Book of Dead', provider: "Play'n GO", category: 'slots', thumbnail: '📚', slug: 'book-of-dead' },
  { id: '3', title: 'Starburst', provider: 'NetEnt', category: 'slots', thumbnail: '⭐', slug: 'starburst' },
  { id: '4', title: "Gonzo's Quest", provider: 'NetEnt', category: 'slots', thumbnail: '🗿', slug: 'gonzos-quest' },
  { id: '5', title: 'Gates of Olympus', provider: 'Pragmatic Play', category: 'slots', thumbnail: '⚡', slug: 'gates-of-olympus' },
  { id: '6', title: 'Sweet Bonanza', provider: 'Pragmatic Play', category: 'slots', thumbnail: '🍭', slug: 'sweet-bonanza' },
  { id: '7', title: 'Lightning Roulette', provider: 'Evolution', category: 'live-casino', thumbnail: '⚡', slug: 'lightning-roulette' },
  { id: '8', title: 'Live Blackjack', provider: 'Evolution', category: 'live-casino', thumbnail: '🃏', slug: 'live-blackjack' },
  { id: '9', title: 'Live Baccarat', provider: 'Evolution', category: 'live-casino', thumbnail: '♦️', slug: 'live-baccarat' },
  { id: '10', title: 'Crazy Time', provider: 'Evolution', category: 'live-casino', thumbnail: '🎡', slug: 'crazy-time' },
];

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>(demoGames);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.games.getAll().then((data) => {
      if (Array.isArray(data) && data.length) setGames(data);
    }).catch(() => {});
  }, []);

  const visible = filter === 'all' ? games : games.filter(g => g.category === filter);

  return (
    <main className="min-h-screen bg-gray-950 text-white py-12">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold mb-3">🎮 Games</h1>
          <p className="text-gray-400">Explore the Cassanova game collection</p>
        </div>

        <div className="flex flex-wrap justify-center gap-3 mb-10">
          {[
            ['all', 'All Games'], ['slots', '🎰 Slots'], ['table-games', '🃏 Table Games'],
            ['live-casino', '🎥 Live Casino'], ['video-poker', '♠️ Video Poker']
          ].map(([value, label]) => (
            <button key={value} onClick={() => setFilter(value)}
              className={`px-5 py-2 rounded-full font-semibold transition ${filter === value ? 'bg-yellow-500 text-gray-950' : 'bg-gray-800 hover:bg-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="text-center py-20 text-gray-400">No games found.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5">
            {visible.map((game) => (
              <Link key={game._id || game.id} href={`/games/${game.slug || game.id}`}
                className="group bg-gray-900 rounded-2xl overflow-hidden border border-white/10 hover:border-yellow-500/50 transition">
                <div className="aspect-square bg-gradient-to-br from-purple-700 via-fuchsia-700 to-pink-700 flex items-center justify-center text-6xl group-hover:scale-105 transition">
                  {game.thumbnail || '🎰'}
                </div>
                <div className="p-4">
                  <h2 className="font-bold truncate">{game.title}</h2>
                  <p className="text-sm text-gray-400 mt-1">{game.provider}</p>
                  <span className="inline-block mt-3 text-xs bg-white/10 px-2 py-1 rounded-full capitalize">
                    {game.category.replace('-', ' ')}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
