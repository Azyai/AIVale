package agentexecution

import (
	"context"
	"errors"
	"fmt"

	"github.com/cloudwego/eino/compose"
)

type einoRuntime struct {
	graph compose.Runnable[StepInput, StepOutput]
}

// NewEinoRuntime explicitly compiles a single injected step. Construction does
// not run the step, read credentials or files, or establish network connections.
// The compiled runtime is not installed into the API or worker startup path.
func NewEinoRuntime(ctx context.Context, step Step) (Runtime, error) {
	if ctx == nil {
		return nil, errors.New("runtime construction context is required")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if step == nil {
		return nil, errors.New("runtime step is required")
	}

	graph := compose.NewGraph[StepInput, StepOutput]()
	lambda := compose.InvokableLambda(func(ctx context.Context, input StepInput) (StepOutput, error) {
		if err := ctx.Err(); err != nil {
			return StepOutput{}, err
		}
		return step(ctx, input)
	})
	if err := graph.AddLambdaNode("step", lambda); err != nil {
		return nil, fmt.Errorf("add runtime step: %w", err)
	}
	if err := graph.AddEdge(compose.START, "step"); err != nil {
		return nil, fmt.Errorf("connect runtime input: %w", err)
	}
	if err := graph.AddEdge("step", compose.END); err != nil {
		return nil, fmt.Errorf("connect runtime output: %w", err)
	}
	runnable, err := graph.Compile(ctx)
	if err != nil {
		return nil, fmt.Errorf("compile runtime step: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return &einoRuntime{graph: runnable}, nil
}

func (r *einoRuntime) RunStep(ctx context.Context, input StepInput) (StepOutput, error) {
	if ctx == nil {
		return StepOutput{}, errors.New("step context is required")
	}
	if err := ctx.Err(); err != nil {
		return StepOutput{}, err
	}

	// This single-node graph waits for the injected step to finish. Do not race
	// it against ctx.Done in another goroutine and leave work running behind it.
	output, err := r.graph.Invoke(ctx, input)
	if err != nil {
		if contextErr := ctx.Err(); contextErr != nil && !errors.Is(err, contextErr) {
			err = errors.Join(err, contextErr)
		}
		return StepOutput{}, fmt.Errorf("run runtime step: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return StepOutput{}, err
	}
	return output, nil
}
