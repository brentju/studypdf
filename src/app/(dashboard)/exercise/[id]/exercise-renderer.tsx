"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface ExerciseRendererProps {
  exerciseId: string;
  exerciseType: string;
  options: string | null;
}

interface Option {
  id: string;
  label: string;
  text: string;
}

export function ExerciseRenderer({
  exerciseId,
  exerciseType,
  options,
}: ExerciseRendererProps) {
  const [answer, setAnswer] = useState("");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const parsedOptions: Option[] = options ? JSON.parse(options) : [];

  const handleSubmit = async () => {
    setIsSubmitting(true);

    // TODO: Submit answer to API for evaluation
    // For now, just mark as submitted
    await new Promise((resolve) => setTimeout(resolve, 500));

    setSubmitted(true);
    setIsSubmitting(false);
  };

  const handleReset = () => {
    setAnswer("");
    setSelectedOption(null);
    setSubmitted(false);
  };

  if (submitted) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-primary/10 p-2">
            <svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-medium text-foreground">Answer Submitted</p>
            <p className="text-sm text-muted-foreground">
              {exerciseType === "multiple_choice" || exerciseType === "single_select"
                ? `You selected: ${parsedOptions.find((o) => o.id === selectedOption)?.text || selectedOption}`
                : `Your answer: "${answer.slice(0, 100)}${answer.length > 100 ? "..." : ""}"`}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  switch (exerciseType) {
    case "multiple_choice":
    case "single_select":
      return (
        <div className="space-y-4">
          <RadioGroup value={selectedOption || ""} onValueChange={setSelectedOption}>
            {parsedOptions.map((option) => (
              <div
                key={option.id}
                className="flex items-center space-x-3 rounded-lg border border-border/50 p-4 hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
                onClick={() => setSelectedOption(option.id)}
              >
                <RadioGroupItem value={option.id} id={option.id} />
                <Label
                  htmlFor={option.id}
                  className="flex-1 cursor-pointer text-foreground"
                >
                  <span className="font-medium text-primary mr-2">{option.label}.</span>
                  {option.text}
                </Label>
              </div>
            ))}
          </RadioGroup>

          <Button
            onClick={handleSubmit}
            disabled={!selectedOption || isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Submitting..." : "Submit Answer"}
          </Button>
        </div>
      );

    case "short_answer":
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="answer">Your Answer</Label>
            <Input
              id="answer"
              placeholder="Type your answer here..."
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="bg-background"
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!answer.trim() || isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Submitting..." : "Submit Answer"}
          </Button>
        </div>
      );

    case "long_answer":
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="answer">Your Answer</Label>
            <Textarea
              id="answer"
              placeholder="Write your detailed answer here..."
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="min-h-[150px] bg-background"
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!answer.trim() || isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Submitting..." : "Submit Answer"}
          </Button>
        </div>
      );

    case "mathematical":
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="answer">Your Solution</Label>
            <Textarea
              id="answer"
              placeholder="Show your work and provide the final answer..."
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="min-h-[200px] bg-background font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Tip: You can use LaTeX notation for math expressions (e.g., $x^2 + y^2 = z^2$)
            </p>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!answer.trim() || isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Submitting..." : "Submit Answer"}
          </Button>
        </div>
      );

    case "coding":
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="answer">Your Code</Label>
            <Textarea
              id="answer"
              placeholder="// Write your code here..."
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="min-h-[250px] bg-background font-mono text-sm"
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!answer.trim() || isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Submitting..." : "Submit Answer"}
          </Button>
        </div>
      );

    default:
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="answer">Your Answer</Label>
            <Textarea
              id="answer"
              placeholder="Write your answer here..."
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="min-h-[100px] bg-background"
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!answer.trim() || isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Submitting..." : "Submit Answer"}
          </Button>
        </div>
      );
  }
}
