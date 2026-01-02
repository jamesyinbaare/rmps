"use client";

import { Card, CardContent, CardHeader, CardTitle } from "./Card";
import { Progress } from "./Progress";
import { Target, Plus } from "lucide-react";
import { Button } from "./Button";

const goals = [
  {
    id: 1,
    name: "Emergency Fund",
    target: 10000,
    current: 3200,
    deadline: "Dec 2024",
  },
  {
    id: 2,
    name: "Vacation",
    target: 5000,
    current: 1800,
    deadline: "Aug 2024",
  },
  {
    id: 3,
    name: "New Phone",
    target: 2500,
    current: 1200,
    deadline: "Jun 2024",
  },
];

export function SavingsGoals() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-[var(--secondary)]" />
          Savings Goals
        </CardTitle>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          New Goal
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {goals.map((goal) => {
          const percentage = (goal.current / goal.target) * 100;
          return (
            <div key={goal.id} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{goal.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Target: ₵{goal.target.toLocaleString()} • {goal.deadline}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-[var(--success)]">
                    ₵{goal.current.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {percentage.toFixed(0)}%
                  </p>
                </div>
              </div>
              <Progress value={percentage} max={100} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
