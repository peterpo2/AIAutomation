import { motion } from 'framer-motion';
import { Users, Video, BarChart3, Globe, BadgeCheck, Calendar, Clock, Play } from 'lucide-react';

interface ClientVideo {
  title: string;
  postedAt: string;
  views: string;
  likes: string;
  comments: string;
  status: 'Published' | 'Scheduled';
}

interface ClientAnalytics {
  totalViews: string;
  engagementRate: string;
  completionRate: string;
  postingCadence: string;
  topPerformer: string;
}

interface ClientProfile {
  name: string;
  industry: string;
  account: {
    handle: string;
    followers: string;
    region: string;
    status: string;
    lastPosted: string;
  };
  videos: ClientVideo[];
  analytics: ClientAnalytics;
}

const clients: ClientProfile[] = [
  {
    name: 'Kaufland',
    industry: 'Retail & Supermarkets',
    account: {
      handle: '@kaufland_bg',
      followers: '187K',
      region: 'Bulgaria',
      status: 'Active Partnership',
      lastPosted: '2 days ago',
    },
    videos: [
      {
        title: 'Summer Savings Campaign',
        postedAt: 'Aug 10, 2024',
        views: '126.4K',
        likes: '8.2K',
        comments: '315',
        status: 'Published',
      },
      {
        title: 'Fresh Produce Spotlight',
        postedAt: 'Aug 6, 2024',
        views: '94.8K',
        likes: '6.1K',
        comments: '204',
        status: 'Published',
      },
      {
        title: 'Weekend Deals Teaser',
        postedAt: 'Aug 14, 2024',
        views: 'Scheduled',
        likes: '-',
        comments: '-',
        status: 'Scheduled',
      },
    ],
    analytics: {
      totalViews: '1.9M',
      engagementRate: '6.2%',
      completionRate: '84%',
      postingCadence: '3 posts / week',
      topPerformer: 'Summer Savings Campaign',
    },
  },
  {
    name: 'Practiker',
    industry: 'Home Improvement & DIY',
    account: {
      handle: '@practiker_official',
      followers: '94K',
      region: 'Bulgaria',
      status: 'Active Partnership',
      lastPosted: '5 days ago',
    },
    videos: [
      {
        title: 'DIY Backyard Makeover',
        postedAt: 'Aug 8, 2024',
        views: '78.1K',
        likes: '4.7K',
        comments: '162',
        status: 'Published',
      },
      {
        title: 'Tool Tuesday Live Demo',
        postedAt: 'Aug 1, 2024',
        views: '65.2K',
        likes: '3.9K',
        comments: '118',
        status: 'Published',
      },
      {
        title: 'Autumn Prep Checklist',
        postedAt: 'Aug 16, 2024',
        views: 'Scheduled',
        likes: '-',
        comments: '-',
        status: 'Scheduled',
      },
    ],
    analytics: {
      totalViews: '1.1M',
      engagementRate: '5.4%',
      completionRate: '79%',
      postingCadence: '2 posts / week',
      topPerformer: 'DIY Backyard Makeover',
    },
  },
  {
    name: 'Technopolis',
    industry: 'Electronics & Appliances',
    account: {
      handle: '@technopolis_bg',
      followers: '142K',
      region: 'Bulgaria',
      status: 'Active Partnership',
      lastPosted: '1 day ago',
    },
    videos: [
      {
        title: 'Smart Home Essentials 2024',
        postedAt: 'Aug 12, 2024',
        views: '134.6K',
        likes: '9.5K',
        comments: '421',
        status: 'Published',
      },
      {
        title: 'Gaming Weekend Deals',
        postedAt: 'Aug 9, 2024',
        views: '118.3K',
        likes: '8.1K',
        comments: '296',
        status: 'Published',
      },
      {
        title: 'Campus Tech Starter Pack',
        postedAt: 'Aug 15, 2024',
        views: 'Scheduled',
        likes: '-',
        comments: '-',
        status: 'Scheduled',
      },
    ],
    analytics: {
      totalViews: '2.3M',
      engagementRate: '6.9%',
      completionRate: '88%',
      postingCadence: '3 posts / week',
      topPerformer: 'Smart Home Essentials 2024',
    },
  },
];

export default function Clients() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Clients</h1>
        <p className="text-gray-600 mt-1">
          Track TikTok performance across every partner brand in your portfolio.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {clients.map((client, index) => (
          <motion.div
            key={client.name}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white border border-gray-100 rounded-2xl shadow-lg overflow-hidden"
          >
            <div className="bg-gradient-to-r from-red-500/90 to-red-500/70 text-white p-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold">{client.name}</h2>
                <p className="text-sm text-red-50">{client.industry}</p>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <BadgeCheck className="w-5 h-5" />
                <span>{client.account.status}</span>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 bg-red-50 border border-red-100 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <Users className="w-10 h-10 text-red-500" />
                    <div>
                      <p className="text-sm text-red-400 font-medium">TikTok Account</p>
                      <p className="text-xl font-semibold text-red-600">{client.account.handle}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-700">
                    <div className="bg-white rounded-lg p-3 border border-red-100 shadow-sm">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Followers</p>
                      <p className="text-lg font-semibold text-gray-800">{client.account.followers}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-red-100 shadow-sm">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Region</p>
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-red-400" />
                        <p className="text-lg font-semibold text-gray-800">{client.account.region}</p>
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-red-100 shadow-sm">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Last Post</p>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-red-400" />
                        <p className="text-lg font-semibold text-gray-800">{client.account.lastPosted}</p>
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-red-100 shadow-sm">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Cadence</p>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-red-400" />
                        <p className="text-lg font-semibold text-gray-800">{client.analytics.postingCadence}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <Video className="w-5 h-5 text-gray-500" />
                        <h3 className="text-lg font-semibold text-gray-800">Published & Scheduled Videos</h3>
                      </div>
                      <span className="text-sm text-gray-500">{client.videos.length} total</span>
                    </div>
                    <div className="space-y-4">
                      {client.videos.map((video) => (
                        <div
                          key={video.title}
                          className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                        >
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${video.status === 'Published' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
                              <Play className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800">{video.title}</p>
                              <p className="text-sm text-gray-500">{video.postedAt}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-4 text-center text-sm text-gray-600">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-gray-400">Views</p>
                              <p className="font-semibold text-gray-800">{video.views}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-gray-400">Likes</p>
                              <p className="font-semibold text-gray-800">{video.likes}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-gray-400">Comments</p>
                              <p className="font-semibold text-gray-800">{video.comments}</p>
                            </div>
                          </div>
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              video.status === 'Published'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}
                          >
                            {video.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <BarChart3 className="w-5 h-5 text-gray-500" />
                      <h3 className="text-lg font-semibold text-gray-800">Performance Analytics</h3>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                        <p className="text-xs uppercase tracking-wide text-gray-400">Total Views</p>
                        <p className="mt-2 text-xl font-semibold text-gray-800">{client.analytics.totalViews}</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                        <p className="text-xs uppercase tracking-wide text-gray-400">Engagement Rate</p>
                        <p className="mt-2 text-xl font-semibold text-gray-800">{client.analytics.engagementRate}</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                        <p className="text-xs uppercase tracking-wide text-gray-400">Completion Rate</p>
                        <p className="mt-2 text-xl font-semibold text-gray-800">{client.analytics.completionRate}</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 p-4 bg-gray-50 col-span-2 sm:col-span-1">
                        <p className="text-xs uppercase tracking-wide text-gray-400">Top Performer</p>
                        <p className="mt-2 text-sm font-semibold text-gray-800">{client.analytics.topPerformer}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
