import * as React from "react"
import { cn } from "@/lib/utils"
import { Copy, Check, Download, Play, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

// Import Prism.js - use basic setup without individual component imports
import Prism from "prismjs"

interface CodeBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  children: string
  language?: string | undefined
  showLineNumbers?: boolean
  showCopyButton?: boolean
  showRunButton?: boolean
  showDownloadButton?: boolean
  maxHeight?: number
  collapsible?: boolean
}

// Language detection function
const detectLanguage = (code: string): string => {
  if (/import|export|const|let|=>/.test(code)) return 'javascript'
  if (/def |import |print\(/.test(code)) return 'python'
  if (/func |package |fmt\./.test(code)) return 'go'
  if (/<[a-z][\s\S]*>/i.test(code)) return 'html'
  if (/{[\s\S]*}|[a-z-]+:\s*[^;]+;/.test(code)) return 'css'
  return 'javascript'
}

// Prism.js highlighting function
const highlightSyntax = (code: string, language?: string): string => {
  const lang = language?.toLowerCase() || detectLanguage(code)
  const grammar = Prism.languages[lang] || Prism.languages.javascript
  if (!grammar) {
    return code
  }
  return Prism.highlight(code, grammar, lang)
}

const CodeBlock = React.forwardRef<HTMLDivElement, CodeBlockProps>(
  ({
    className,
    children,
    language,
    showLineNumbers = false,
    showCopyButton = true,
    showRunButton = false,
    showDownloadButton = false,
    maxHeight,
    collapsible = false,
    ...props
  }, ref) => {
    const [copied, setCopied] = React.useState(false)
    const [isCollapsed, setIsCollapsed] = React.useState(collapsible)
    const lines = children.split('\n').filter(line => line.trim() !== '')

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(children)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (err) {
        console.error('Failed to copy text: ', err)
      }
    }

    const handleDownload = () => {
      const extension = language === 'python' ? 'py' :
                       language === 'javascript' ? 'js' :
                       language === 'typescript' ? 'ts' :
                       language === 'html' ? 'html' :
                       language === 'css' ? 'css' : 'txt'
      const blob = new Blob([children], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `code.${extension}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }

    const handleRun = () => {
      // TODO: Implement code execution logic
      console.log('Run code:', children)
    }

    const highlightedContent = highlightSyntax(children, language)
    const shouldShowHeader = language || showCopyButton || showRunButton || showDownloadButton

    const codeContent = (
      <div className="code-block-scrollable">
        <pre className={cn(
          "rounded-lg bg-transparent text-gray-100 overflow-x-auto font-mono text-code-sm leading-code-relaxed",
          maxHeight && `max-h-[200px] overflow-y-auto`,
          showLineNumbers && "pl-8"
        )}>
          {showLineNumbers ? (
            <code className={`language-${language || 'javascript'} font-['Fira_Code',monospace] block`}>
              {lines.map((line, index) => (
                <div key={index} className="flex">
                  <span className="inline-block w-6 text-right text-neutral-500 select-none mr-4 text-xs">
                    {index + 1}
                  </span>
                  <span dangerouslySetInnerHTML={{
                    __html: highlightSyntax(line, language) || line
                  }} />
                </div>
              ))}
            </code>
          ) : (
            <code
              className={`language-${language || 'javascript'} font-['Fira_Code',monospace]`}
              dangerouslySetInnerHTML={{ __html: highlightedContent }}
            />
          )}
        </pre>
      </div>
    )

    const headerButtons = [
      showCopyButton ? {
        icon: copied ? Check : Copy,
        label: copied ? "Copied!" : "Copy",
        onClick: handleCopy,
        variant: (copied ? "default" : "ghost") as "default" | "ghost",
      } : null,
      showRunButton ? {
        icon: Play,
        label: "Run",
        onClick: handleRun,
        variant: "ghost" as const,
      } : null,
      showDownloadButton ? {
        icon: Download,
        label: "Download",
        onClick: handleDownload,
        variant: "ghost" as const,
      } : null,
    ].filter((button): button is NonNullable<typeof button> => button !== null)

    return (
      <div
        ref={ref}
        className={cn(
          "relative my-2 mb-6 mt-4 rounded-3xl bg-neutral-300/50 dark:bg-[#1e1f20]/75 border border-neutral-300 dark:border-neutral-900/50 overflow-hidden font-mono text-sm text-neutral-800 dark:text-neutral-100 shadow-sm",
          className
        )}
        {...props}
      >
        {/* Enhanced Header */}
        {shouldShowHeader && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700/30 bg-neutral-400/50 dark:bg-[#1e1f20]">
            <div className="flex items-center gap-2">
              {language && (
                <span className="text-xs text-neutral-500 dark:text-neutral-500 uppercase tracking-wider font-medium select-none px-2 py-1 bg-transparent rounded">
                  {language}
                </span>
              )}
              {collapsible && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className="h-6 w-6 p-0 text-neutral-400 hover:text-neutral-200"
                >
                  {isCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-1">
              {headerButtons.map((button, index) => (
                <Button
                  key={index}
                  size="sm"
                  variant={button.variant}
                  onClick={button.onClick}
                  className="h-7 px-2 text-xs hover:bg-neutral-700"
                  title={button.label}
                >
                  <button.icon className="h-3 w-3 mr-1" />
                  {button.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Code Content */}
        {collapsible ? (
          <Collapsible open={!isCollapsed} onOpenChange={(open) => setIsCollapsed(!open)}>
            <CollapsibleContent className="p-4">
              {codeContent}
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <div className="p-4">
            {codeContent}
          </div>
        )}
      </div>
    )
  }
)

CodeBlock.displayName = "CodeBlock"

// Icon components
const CopyIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
)

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

export { CodeBlock, type CodeBlockProps }
