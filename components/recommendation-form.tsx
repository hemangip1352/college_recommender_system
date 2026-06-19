"use client";

import { useState, useCallback } from "react";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, GripVertical } from "lucide-react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";

// ---------------------------------------------------------------------------
// Form Schema
// ---------------------------------------------------------------------------

const FormSchema = z.object({
  mhtcetPercentile: z.coerce
    .number()
    .min(0)
    .max(100, "Percentile must be between 0-100"),
  jeePercentile: z.coerce.number().min(0).max(100).optional(),
  twelfthPercentage: z.coerce
    .number()
    .min(0)
    .max(100, "Percentage must be between 0-100")
    .optional(),
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

// ---------------------------------------------------------------------------
// Priority metrics
// ---------------------------------------------------------------------------

const DEFAULT_PRIORITY_ORDER = [
  "placement",
  "campusLife",
  "infrastructure",
  "teaching",
  "hostel",
  "fees",
  "location",
  "industryExposure",
];

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

function getMetricEmoji(metric: string): string {
  const emojis: Record<string, string> = {
    placement: "💼",
    campusLife: "🎓",
    infrastructure: "🏛️",
    teaching: "📚",
    hostel: "🏠",
    fees: "💰",
    location: "📍",
    industryExposure: "🏭",
  };
  return emojis[metric] || "⚙️";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecommendationForm({
  onRecommendationsReceived,
}: RecommendationFormProps) {
  const [loading, setLoading] = useState(false);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [allMaharashtra, setAllMaharashtra] = useState(true); // Default: All Maharashtra
  const [priorityOrder, setPriorityOrder] = useState<string[]>(
    DEFAULT_PRIORITY_ORDER
  );

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

  // -------------------------------------------------------------------------
  // Drag-and-drop handler
  // -------------------------------------------------------------------------

  const onDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return;
      if (result.destination.index === result.source.index) return;

      const reordered = Array.from(priorityOrder);
      const [removed] = reordered.splice(result.source.index, 1);
      reordered.splice(result.destination.index, 0, removed);
      setPriorityOrder(reordered);

      // Sync new weights back into form state so they're included in payload
      const updatedWeights: Record<string, number> = {};
      reordered.forEach((metric, index) => {
        updatedWeights[metric] = PRIORITY_WEIGHTS[index + 1] || 1;
      });
      form.setValue("priorityWeights", updatedWeights);
    },
    [priorityOrder, form]
  );

  // -------------------------------------------------------------------------
  // Submission
  // -------------------------------------------------------------------------

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setLoading(true);
    try {
      // Build final priority weights from current drag order
      const priorityWeights: Record<string, number> = {};
      priorityOrder.forEach((metric, index) => {
        priorityWeights[metric] = PRIORITY_WEIGHTS[index + 1] || 1;
      });

      const payload = {
        ...data,
        branchPreferences: selectedBranches,
        // If "All Maharashtra" is checked, send empty array (no city filter)
        cityPreferences: allMaharashtra ? [] : selectedCities,
        priorityWeights,
      };

      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        throw new Error(
          errBody?.error || `Server error (${response.status})`
        );
      }

      const result = await response.json();
      onRecommendationsReceived(result.data);
    } catch (error) {
      console.error("Error:", error);
      alert(
        error instanceof Error
          ? `Failed: ${error.message}`
          : "Failed to generate recommendations. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Find Your Engineering College</CardTitle>
        <CardDescription>
          Enter your details to get personalised Maharashtra CAP college
          recommendations
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {/* ============================================================
                Section 1 — Basic Information
            ============================================================ */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">
                Basic Information
              </h3>

              {/* MHT-CET Percentile */}
              <FormField
                control={form.control}
                name="mhtcetPercentile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>MHT CET Percentile *</FormLabel>
                    <FormControl>
                      <Input
                        id="mhtcet-percentile"
                        type="number"
                        step="0.01"
                        placeholder="e.g., 85.50"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 12th Percentage — NEW FIELD */}
              <FormField
                control={form.control}
                name="twelfthPercentage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>12th (HSC) Percentage</FormLabel>
                    <FormControl>
                      <Input
                        id="twelfth-percentage"
                        type="number"
                        step="0.01"
                        placeholder="e.g., 78.40"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Used for eligibility checks (e.g., 45% required for
                      General / 40% for reserved categories). Optional.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* JEE Percentile */}
              <FormField
                control={form.control}
                name="jeePercentile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>JEE Percentile (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        id="jee-percentile"
                        type="number"
                        step="0.01"
                        placeholder="e.g., 75.00"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Category */}
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger id="category-select">
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

              {/* Gender */}
              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger id="gender-select">
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

              {/* Home University */}
              <FormField
                control={form.control}
                name="homeUniversity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Home University *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger id="university-select">
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
                    <p className="text-xs text-muted-foreground mt-1">
                      Your 12th-standard school's affiliated university.
                      Determines Home University (HU) seat eligibility.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ============================================================
                Section 2 — Branch Preferences
            ============================================================ */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">
                Branch Preferences *
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {BRANCHES.map((branch) => (
                  <div key={branch} className="flex items-center space-x-2">
                    <Checkbox
                      id={`branch-${branch}`}
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
                      htmlFor={`branch-${branch}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {branch}
                    </label>
                  </div>
                ))}
              </div>
              {selectedBranches.length === 0 && (
                <p className="text-sm text-destructive">
                  Please select at least one branch.
                </p>
              )}
            </div>

            {/* ============================================================
                Section 3 — City Preferences
            ============================================================ */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">
                City Preferences
              </h3>

              {/* "All Maharashtra" master toggle */}
              <div className="flex items-center space-x-3 p-3 bg-secondary rounded-lg border">
                <Checkbox
                  id="all-maharashtra"
                  checked={allMaharashtra}
                  onCheckedChange={(checked) => {
                    const isChecked = Boolean(checked);
                    setAllMaharashtra(isChecked);
                    if (isChecked) {
                      // Clear individual city selections when toggling to "All MH"
                      setSelectedCities([]);
                    }
                  }}
                />
                <div>
                  <label
                    htmlFor="all-maharashtra"
                    className="text-sm font-semibold cursor-pointer"
                  >
                    🗺️ All Maharashtra (Default)
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Show colleges from any city in Maharashtra. Uncheck to
                    filter by specific cities.
                  </p>
                </div>
              </div>

              {/* Individual cities — disabled when "All Maharashtra" is active */}
              {!allMaharashtra && (
                <div className="grid grid-cols-2 gap-3 mt-2">
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
                        className="text-sm font-medium leading-none cursor-pointer"
                      >
                        {city}
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ============================================================
                Section 4 — Drag-and-Drop Priority Ranking
            ============================================================ */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b pb-2">
                Rank Your Priorities
              </h3>
              <p className="text-sm text-muted-foreground">
                Drag items to reorder. Top = most important. Weights are
                assigned automatically based on position.
              </p>

              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="priority-list">
                  {(droppableProvided) => (
                    <div
                      ref={droppableProvided.innerRef}
                      {...droppableProvided.droppableProps}
                      className="space-y-2"
                    >
                      {priorityOrder.map((metric, index) => (
                        <Draggable
                          key={metric}
                          draggableId={metric}
                          index={index}
                        >
                          {(draggableProvided, snapshot) => (
                            <div
                              ref={draggableProvided.innerRef}
                              {...draggableProvided.draggableProps}
                              className={`flex items-center justify-between p-3 rounded-lg border transition-shadow ${
                                snapshot.isDragging
                                  ? "bg-primary/10 border-primary shadow-lg ring-2 ring-primary/30"
                                  : "bg-secondary border-transparent"
                              }`}
                            >
                              {/* Drag handle */}
                              <div
                                {...draggableProvided.dragHandleProps}
                                className="mr-3 text-muted-foreground cursor-grab active:cursor-grabbing"
                                aria-label={`Drag to reorder ${formatMetricName(metric)}`}
                              >
                                <GripVertical className="w-4 h-4" />
                              </div>

                              <span className="flex-1 font-medium text-sm">
                                <span className="mr-2 text-muted-foreground">
                                  #{index + 1}
                                </span>
                                {getMetricEmoji(metric)}{" "}
                                {formatMetricName(metric)}
                              </span>

                              <span className="text-xs font-semibold px-2 py-1 bg-primary/10 text-primary rounded-full">
                                Weight {PRIORITY_WEIGHTS[index + 1]}
                              </span>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {droppableProvided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>

            {/* ============================================================
                Submit
            ============================================================ */}
            <Button
              type="submit"
              disabled={loading || selectedBranches.length === 0}
              className="w-full"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? "Getting Recommendations..." : "Get Recommendations"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
