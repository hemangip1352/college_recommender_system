import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, TrendingUp, Zap, Brain } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-900 to-blue-800">
      {/* Navigation */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="text-2xl font-bold text-blue-600">
            MH CAP Recommender
          </div>
          <div className="space-x-4">
            <Link href="/recommendations">
              <Button variant="outline">Get Recommendations</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-white">
        <h1 className="text-5xl font-bold mb-6">
          Find Your Perfect Engineering College
        </h1>
        <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
          Make informed decisions based on real data, not guesses. Get personalized college recommendations using advanced filtering and AI-powered insights.
        </p>
        <Link href="/recommendations">
          <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100">
            Start Exploring
          </Button>
        </Link>
      </div>

      {/* Features Section */}
      <div className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">
            Why Choose Our Platform?
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={<TrendingUp className="w-8 h-8" />}
              title="Data-Driven"
              description="Real cutoff data, placement stats, and fees from official sources"
            />
            <FeatureCard
              icon={<Zap className="w-8 h-8" />}
              title="Smart Filtering"
              description="Filter by category, gender, branch, and home university rules"
            />
            <FeatureCard
              icon={<Brain className="w-8 h-8" />}
              title="AI Insights"
              description="Get AI-powered summaries of college strengths and weaknesses"
            />
            <FeatureCard
              icon={<CheckCircle2 className="w-8 h-8" />}
              title="Personalized Ranking"
              description="Colleges ranked based on your priorities and preferences"
            />
          </div>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">
            How It Works
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <StepCard
              number="1"
              title="Enter Your Profile"
              description="Provide your percentile, category, gender, and branch preferences"
            />
            <StepCard
              number="2"
              title="Set Your Priorities"
              description="Rank factors like placements, campus life, and fees by importance"
            />
            <StepCard
              number="3"
              title="Get Recommendations"
              description="Receive colleges ranked in Dream, Target, and Safe tiers"
            />
          </div>

          <div className="mt-12 text-center">
            <Link href="/recommendations">
              <Button size="lg">Get Started Now</Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Key Features Section */}
      <div className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">
            Key Features
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <FeatureDetailsCard
              title="Three-Tier Recommendation System"
              description="Get colleges categorized as Dream (slightly below cutoff), Target (near cutoff), and Safe (well above cutoff)"
            />
            <FeatureDetailsCard
              title="Comprehensive College Profiles"
              description="View detailed information including cutoffs, placement data, fees, infrastructure scores, and student reviews"
            />
            <FeatureDetailsCard
              title="College Comparison"
              description="Compare up to 3 colleges side-by-side to make the best decision"
            />
            <FeatureDetailsCard
              title="AI-Powered Summaries"
              description="Gemini AI provides factual summaries of college strengths based on verified data"
            />
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-blue-600 text-white py-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Make Your Decision?
          </h2>
          <p className="text-lg mb-8">
            Get your personalized college recommendations in just a few minutes
          </p>
          <Link href="/recommendations">
            <Button size="lg" variant="outline" className="text-white border-white hover:bg-white hover:text-blue-600">
              Explore Colleges Now
            </Button>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-300 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p>&copy; 2026 Maharashtra CAP Recommender. All rights reserved.</p>
          <p className="text-sm mt-2">
            Data sourced from official Maharashtra CAP admissions data
          </p>
        </div>
      </footer>
    </main>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="text-blue-600 mb-2">{icon}</div>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

interface StepCardProps {
  number: string;
  title: string;
  description: string;
}

function StepCard({ number, title, description }: StepCardProps) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-600 text-white font-bold text-lg mb-4">
        {number}
      </div>
      <h3 className="text-xl font-semibold mb-2 text-gray-900">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}

interface FeatureDetailsCardProps {
  title: string;
  description: string;
}

function FeatureDetailsCard({ title, description }: FeatureDetailsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
