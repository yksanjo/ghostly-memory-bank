#!/bin/bash
# shell-integration.sh
# Auto-capture terminal commands for Ghostly Memory Bank
# Source this in your ~/.bashrc or ~/.zshrc

# Detect shell
if [ -n "$BASH_VERSION" ]; then
    GHOSTLY_SHELL="bash"
elif [ -n "$ZSH_VERSION" ]; then
    GHOSTLY_SHELL="zsh"
else
    echo "Ghostly: Unsupported shell" >&2
    return 1
fi

# Configuration
GHOSTLY_BIN="${GHOSTLY_BIN:-ghostly}"
GHOSTLY_AUTO_SUGGEST="${GHOSTLY_AUTO_SUGGEST:-true}"
GHOSTLY_CAPTURE_TIMEOUT="${GHOSTLY_CAPTURE_TIMEOUT:-2}"
GHOSTLY_MIN_DURATION="${GHOSTLY_MIN_DURATION:-1}"

# State variables
__GHOSTLY_COMMAND=""
__GHOSTLY_START_TIME=""
__GHOSTLY_CWD=""
__GHOSTLY_GIT_BRANCH=""

# Capture command before execution
__ghostly_preexec() {
    __GHOSTLY_COMMAND="$1"
    __GHOSTLY_START_TIME=$(date +%s)
    __GHOSTLY_CWD="$PWD"
    
    # Capture git branch if in a git repo
    if git rev-parse --git-dir > /dev/null 2>&1; then
        __GHOSTLY_GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
    else
        __GHOSTLY_GIT_BRANCH=""
    fi
}

# Capture command result after execution
__ghostly_precmd() {
    local exit_code=$?
    
    # Only process if we have a command
    if [ -z "$__GHOSTLY_COMMAND" ]; then
        return 0
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - __GHOSTLY_START_TIME))
    
    # Only capture commands that ran for at least minimum duration
    if [ $duration -lt $GHOSTLY_MIN_DURATION ]; then
        __GHOSTLY_COMMAND=""
        return 0
    fi
    
    # Build capture command
    local capture_args=(
        capture
        "$__GHOSTLY_COMMAND"
        --exit-code "$exit_code"
        --duration "$duration"
        --cwd "$__GHOSTLY_CWD"
    )
    
    # Add git branch if available
    if [ -n "$__GHOSTLY_GIT_BRANCH" ]; then
        capture_args+=(--git-branch "$__GHOSTLY_GIT_BRANCH")
    fi
    
    # Capture in background with timeout
    (
        timeout "$GHOSTLY_CAPTURE_TIMEOUT" \
            "$GHOSTLY_BIN" "${capture_args[@]}" \
            2>/dev/null
    ) &
    
    # Auto-suggest on error if enabled
    if [ "$GHOSTLY_AUTO_SUGGEST" = "true" ] && [ $exit_code -ne 0 ]; then
        __ghostly_suggest_on_error "$__GHOSTLY_COMMAND" $exit_code
    fi
    
    # Clear state
    __GHOSTLY_COMMAND=""
}

# Suggest solutions on command failure
__ghostly_suggest_on_error() {
    local command="$1"
    local exit_code="$2"
    
    # Quick recall with minimal output
    local suggestions=$("$GHOSTLY_BIN" recall "$command" \
        --exit-code "$exit_code" \
        --quick \
        --limit 1 \
        2>/dev/null)
    
    if [ -n "$suggestions" ]; then
        echo ""
        echo -e "\033[0;33m💡 Ghostly found a similar past issue:\033[0m"
        echo "$suggestions"
        echo ""
    fi
}

# Manual recall command
ghostly-recall() {
    if [ -z "$1" ]; then
        echo "Usage: ghostly-recall <query>"
        return 1
    fi
    
    "$GHOSTLY_BIN" recall "$@" --cwd "$PWD"
}

# Search command history
ghostly-search() {
    if [ -z "$1" ]; then
        echo "Usage: ghostly-search <query>"
        return 1
    fi
    
    "$GHOSTLY_BIN" search "$@" --cwd "$PWD"
}

# Show stats
ghostly-stats() {
    "$GHOSTLY_BIN" stats
}

# Interactive TUI
ghostly-browse() {
    "$GHOSTLY_BIN" browse --cwd "$PWD"
}

# Setup hooks based on shell
if [ "$GHOSTLY_SHELL" = "bash" ]; then
    # Bash setup
    if ! [[ "${PROMPT_COMMAND}" =~ "__ghostly_precmd" ]]; then
        PROMPT_COMMAND="__ghostly_precmd;${PROMPT_COMMAND}"
    fi
    
    # Bash doesn't have preexec by default - use DEBUG trap
    __ghostly_bash_preexec() {
        [ -n "$COMP_LINE" ] && return  # Skip if completing
        [ "$BASH_COMMAND" = "$PROMPT_COMMAND" ] && return  # Skip prompt command
        __ghostly_preexec "$BASH_COMMAND"
    }
    trap '__ghostly_bash_preexec' DEBUG
    
elif [ "$GHOSTLY_SHELL" = "zsh" ]; then
    # Zsh setup
    autoload -Uz add-zsh-hook
    add-zsh-hook preexec __ghostly_preexec
    add-zsh-hook precmd __ghostly_precmd
fi

# Export helper functions
export -f ghostly-recall 2>/dev/null || true
export -f ghostly-search 2>/dev/null || true
export -f ghostly-stats 2>/dev/null || true
export -f ghostly-browse 2>/dev/null || true

# Completion for recall command
if [ "$GHOSTLY_SHELL" = "bash" ]; then
    _ghostly_recall_complete() {
        local cur="${COMP_WORDS[COMP_CWORD]}"
        local suggestions=$("$GHOSTLY_BIN" complete "$cur" 2>/dev/null)
        COMPREPLY=( $(compgen -W "$suggestions" -- "$cur") )
    }
    complete -F _ghostly_recall_complete ghostly-recall
    
elif [ "$GHOSTLY_SHELL" = "zsh" ]; then
    _ghostly_recall_complete() {
        local suggestions=("${(@f)$($GHOSTLY_BIN complete $words[CURRENT] 2>/dev/null)}")
        _describe 'commands' suggestions
    }
    compdef _ghostly_recall_complete ghostly-recall
fi

# Print initialization message
if [ -t 1 ]; then
    echo "👻 Ghostly Memory Bank loaded"
    echo "   Commands: ghostly-recall, ghostly-search, ghostly-stats, ghostly-browse"
    
    # Show first-time tips
    if [ ! -f "$HOME/.ghostly/initialized" ]; then
        mkdir -p "$HOME/.ghostly"
        touch "$HOME/.ghostly/initialized"
        echo ""
        echo "💡 Tips:"
        echo "   • Ghostly auto-captures your commands"
        echo "   • When a command fails, suggestions appear automatically"
        echo "   • Use 'ghostly-recall <query>' to search past solutions"
        echo ""
    fi
fi
