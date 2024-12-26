"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { AppHeader } from "@/components/biz/AppHeader"
import { ChatInput } from "@/components/biz/ChatInput"
import { CodegenGuide } from "@/components/biz/CodegenGuide"
import { ComponentCodeFilterContainer } from "@/components/biz/ComponentCodeFilterContainer"
import { ComponentCodeList } from "@/components/biz/ComponentCodeList"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import TldrawEdit from "@/components/biz/TldrawEdit/TldrawEdit"
import {
  useCodegenDetail,
  useComponentCodeList,
} from "./server-store/selectors"
import { useState } from "react"
import { useCreateComponentCode } from "./server-store/mutations"
import { Prompt, PromptImage } from "@/lib/db/componentCode/types"
import { Skeleton } from "@/components/ui/skeleton"
import { CompoderThinkingLoading } from "@/components/biz/CompoderThinkingLoading"
import { useShowOnFirstData } from "@/hooks/use-show-on-first-data"
import { CodingBox } from "@/components/biz/CodingBox"
import {
  transformNewComponentIdFromXml,
  transformTryCatchErrorFromXml,
} from "@/lib/xml-message-parser/parser"
import { useRouter } from "next/navigation"
import { toast } from "@/hooks/use-toast"
export default function CodegenDetailPage({
  params,
}: {
  params: { codegenId: string }
}) {
  const { data: codegenDetail, isLoading } = useCodegenDetail(params.codegenId)
  const router = useRouter()

  const [currentPage, setCurrentPage] = useState(1)
  const [searchKeyword, setSearchKeyword] = useState("")
  const [filterField, setFilterField] = useState<
    "all" | "name" | "description"
  >("all")

  const { data: componentCodeData, isLoading: isComponentLoading } =
    useComponentCodeList({
      codegenId: params.codegenId,
      page: currentPage,
      pageSize: 10,
      searchKeyword,
      filterField,
    })

  const [chatValue, setChatValue] = useState("")
  const [images, setImages] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [streamingContent, setStreamingContent] = useState("")
  const createComponentMutation = useCreateComponentCode()

  const shouldShowList = useShowOnFirstData(componentCodeData?.items)

  const handleChatSubmit = async () => {
    if (!chatValue.trim() && images.length === 0) return
    setIsSubmitting(true)
    const prompts: Prompt[] = [
      { text: chatValue, type: "text" },
      ...images.map(
        image =>
          ({
            image,
            type: "image",
          } as PromptImage),
      ),
    ]

    try {
      const res = await createComponentMutation.mutateAsync({
        prompt: prompts,
        codegenId: params.codegenId,
      })

      const reader = res?.getReader()
      const decoder = new TextDecoder()
      let content = ""

      while (true) {
        const { done, value } = await reader?.read()
        if (done) break
        content += decoder.decode(value)
        setStreamingContent(content)
      }

      const errorMessage = transformTryCatchErrorFromXml(content)
      if (errorMessage) {
        toast({
          title: "Error",
          description: errorMessage,
        })
      }

      const componentId = transformNewComponentIdFromXml(content)
      if (componentId) {
        router.push(`/main/codegen/${params.codegenId}/${componentId}`)
      }

      setChatValue("")
      setImages([])
    } catch (error) {
      console.error("Failed to create component:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleImageRemove = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div>
      <AppHeader
        breadcrumbs={[
          { label: "Codegen List", href: "/main/codegen" },
          { label: "Codegen Detail" },
        ]}
      />
      <ScrollArea className="h-[calc(100vh-88px)]">
        <div className="w-full max-w-4xl pt-12 pb-12 px-6 flex flex-col mx-auto">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              <CodegenGuide
                prompts={
                  codegenDetail?.prompts.map(prompt => ({
                    title: prompt.title,
                    onClick: () => {
                      setChatValue(prompt.title)
                    },
                  })) || []
                }
                name={codegenDetail?.name || ""}
              />
              <ChatInput
                className="mt-6"
                value={chatValue}
                onChange={setChatValue}
                onSubmit={handleChatSubmit}
                actions={[
                  <TooltipProvider key="draw-image">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <TldrawEdit
                            onSubmit={imageData => {
                              setImages(prev => [...prev, imageData])
                            }}
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Draw An Image</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>,
                ]}
                images={images}
                onImageRemove={handleImageRemove}
                loading={isSubmitting}
                loadingSlot={
                  isSubmitting ? (
                    <CompoderThinkingLoading
                      text={
                        streamingContent
                          ? "Compoder is coding..."
                          : "Compoder is thinking..."
                      }
                    />
                  ) : undefined
                }
              />
            </>
          )}
        </div>
        <div
          className={cn(
            isSubmitting || shouldShowList ? "opacity-100" : "opacity-0",
            "w-full mx-auto px-6 max-w-screen-xl",
          )}
        >
          <p className="text-lg font-bold mb-4">Component List</p>
          <ComponentCodeFilterContainer
            total={componentCodeData?.total || 0}
            currentPage={currentPage}
            searchKeyword={searchKeyword}
            filterField={filterField}
            onPageChange={setCurrentPage}
            onSearchChange={setSearchKeyword}
            onFilterFieldChange={setFilterField}
          >
            {isComponentLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : (
              <ComponentCodeList
                newItem={
                  isSubmitting ? (
                    <CodingBox className="h-full" code={streamingContent} />
                  ) : undefined
                }
                items={componentCodeData?.items || []}
                onEditClick={id => console.log("Edit clicked:", id)}
                onDeleteClick={id => console.log("Delete clicked:", id)}
              />
            )}
          </ComponentCodeFilterContainer>
        </div>
      </ScrollArea>
    </div>
  )
}
