"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database";

type Solution = Database["public"]["Tables"]["solutions"]["Row"];

interface SolutionViewerProps {
  solution: Solution;
}

export function SolutionViewer({ solution }: SolutionViewerProps) {
  const [isRevealed, setIsRevealed] = useState(false);

  if (!isRevealed) {
    return (
      <Card className="border-border/50 bg-card/50">
        <CardContent className="py-8">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
              <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Ready to see the solution?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Try solving the problem first before revealing the answer.
              </p>
            </div>
            <Button onClick={() => setIsRevealed(true)} variant="outline">
              <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Reveal Solution
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Parse steps from alternative_approaches if available (stored as JSON)
  let steps: Array<{
    step_number: number;
    description: string;
    content: string;
    explanation: string;
  }> = [];

  if (solution.alternative_approaches) {
    try {
      const parsed = solution.alternative_approaches as unknown;
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object" && "step_number" in (parsed[0] as object)) {
        steps = parsed as typeof steps;
      }
    } catch {
      // Steps not in expected format
    }
  }

  return (
    <Card className="border-primary/30 bg-card">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Solution
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setIsRevealed(false)}>
            Hide
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Approach */}
        {solution.approach && (
          <div className="space-y-2">
            <h4 className="font-medium text-primary">Approach</h4>
            <p className="text-muted-foreground">{solution.approach}</p>
          </div>
        )}

        {/* Steps (if structured) */}
        {steps.length > 0 && (
          <div className="space-y-4">
            <h4 className="font-medium text-primary">Step-by-Step Solution</h4>
            <div className="space-y-4">
              {steps.map((step) => (
                <div
                  key={step.step_number}
                  className="rounded-lg border border-border/50 bg-background/50 p-4 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-medium">
                      {step.step_number}
                    </span>
                    <span className="font-medium text-foreground">{step.description}</span>
                  </div>
                  <p className="text-foreground pl-8">{step.content}</p>
                  {step.explanation && (
                    <p className="text-sm text-muted-foreground pl-8 italic">
                      {step.explanation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Solution Text (if no structured steps or as fallback) */}
        {(!steps.length || steps.length === 0) && solution.solution_text && (
          <div className="space-y-2">
            <h4 className="font-medium text-primary">Solution</h4>
            <div className="prose prose-invert prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-foreground">
                {solution.solution_text}
              </div>
            </div>
          </div>
        )}

        {/* Explanation / Final Answer */}
        {solution.explanation && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
            <h4 className="font-medium text-primary">Final Answer</h4>
            <p className="text-foreground">{solution.explanation}</p>
          </div>
        )}

        {/* Model info */}
        <div className="pt-4 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            Generated by {solution.model_used || "AI"}
            {solution.verified && " • Verified ✓"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
