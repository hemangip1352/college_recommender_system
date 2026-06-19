"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CATEGORIES,
  GENDERS,
  UNIVERSITIES,
  BRANCHES,
  CITIES,
  PRIORITY_WEIGHTS,
} from "@/lib/config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const FormSchema = z.object({
  mhtcetPercentile: z.coerce
    .number()
    .min(0)
    .max(100, "Percentile must be between 0-100"),
  jeePercentile: z.coerce.number().min(0).max(100).optional(),
  category: z.string().min(1, "Select a category"),
  gender: z.string().min(1, "Select gender"),
  homeUniversity: z.string().min(1, "Select university"),
  branchPreferences: z.array(z.string()).min(1, "Select at least one branch"),
  cityPreferences: z.array(z.string()).optional(),
  priorityWeights: z.record(z.coerce.number()),
});

interface RecommendationFormProps {
  onRecommendationsReceived: (data: any) => void;
}

export function RecommendationForm({
  onRecommendationsReceived,
}: RecommendationFormProps) {
  const [loading, setLoading] = useState(false);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [priorityOrder, setPriorityOrder] = useState<string[]>([
    "placement",
    "campusLife",
    "infrastructure",
    "teaching",
    "hostel",
    "fees",
    "location",
    "industryExposure",
  ]);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      mhtcetPercentile: 85,
      category: "General",
      gender: "M",
      homeUniversity: "University of Pune",
      branchPreferences: [],
      cityPreferences: [],
      priorityWeights: {
        placement: 8,
        campusLife: 7,
        infrastructure: 6,
        teaching: 5,
        hostel: 4,
        fees: 3,
        location: 2,
        industryExposure: 1,
      },
    },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setLoading(true);
    try {
      const priorityWeights: Record<string, number> = {};
      priorityOrder.forEach((metric, index) => {
        priorityWeights[metric] = PRIORITY_WEIGHTS[index + 1] || 1;
      });

      const payload = {
        ...data,
        branchPreferences: selectedBranches,
        cityPreferences: selectedCities,
        priorityWeights,
      };

      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to get recommendations");
      }

      const result = await response.json();
      onRecommendationsReceived(result.data);
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to generate recommendations");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Find Your Engineering College</CardTitle>
        <CardDescription>
          Enter your details to get personalized college recommendations
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Basic Information</h3>

              <FormField
                control={form.control}
                name="mhtcetPercentile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>MHT CET Percentile*</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 85.5"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="jeePercentile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>JEE Percentile (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 75"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category*</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender*</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {GENDERS.map((g) => (
                          <SelectItem key={g} value={g}>
                            {g}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="homeUniversity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Home University*</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {UNIVERSITIES.map((uni) => (
                          <SelectItem key={uni} value={uni}>
                            {uni}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Branch Preferences */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Branch Preferences*</h3>
              <div className="grid grid-cols-2 gap-3">
                {BRANCHES.map((branch) => (
                  <div key={branch} className="flex items-center space-x-2">
                    <Checkbox
                      id={branch}
                      checked={selectedBranches.includes(branch)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedBranches([...selectedBranches, branch]);
                        } else {
                          setSelectedBranches(
                            selectedBranches.filter((b) => b !== branch)
                          );
                        }
                      }}
                    />
                    <label
                      htmlFor={branch}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {branch}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* City Preferences */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">City Preferences (Optional)</h3>
              <div className="grid grid-cols-2 gap-3">
                {CITIES.map((city) => (
                  <div key={city} className="flex items-center space-x-2">
                    <Checkbox
                      id={`city-${city}`}
                      checked={selectedCities.includes(city)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedCities([...selectedCities, city]);
                        } else {
                          setSelectedCities(
                            selectedCities.filter((c) => c !== city)
                          );
                        }
                      }}
                    />
                    <label
                      htmlFor={`city-${city}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {city}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Priority Ranking */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Rank Your Priorities</h3>
              <p className="text-sm text-muted-foreground">
                Drag to reorder. Higher position = more important
              </p>
              <div className="space-y-2">
                {priorityOrder.map((metric, index) => (
                  <div
                    key={metric}
                    className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                  >
                    <span className="font-medium">
                      {index + 1}. {formatMetricName(metric)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      Weight: {PRIORITY_WEIGHTS[index + 1]}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Advanced drag-and-drop reordering coming soon. Current order reflects importance.
              </p>
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Getting Recommendations..." : "Get Recommendations"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function formatMetricName(metric: string): string {
  const names: Record<string, string> = {
    placement: "Placement",
    campusLife: "Campus Life",
    infrastructure: "Infrastructure",
    teaching: "Teaching Quality",
    hostel: "Hostel Facilities",
    fees: "Low Fees",
    location: "Preferred Location",
    industryExposure: "Industry Exposure",
  };
  return names[metric] || metric;
}
