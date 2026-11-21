import { getFormatter, getTranslations } from "@/core/i18n/server"
import { Badge } from "@/shared/ui/base/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/base/table"
import { getEventResponses } from "./query"

/**
 * An Event's Responses for Admins: the counts, every Response with its reason and comment, and who
 * has not answered. Read-only, so a Cancelled Event keeps showing what was answered.
 */
export async function EventResponses({ eventId }: { eventId: string }) {
  const view = await getEventResponses(eventId)
  if (!view) return null
  const [t, answers, format] = await Promise.all([
    getTranslations("Events.responses"),
    getTranslations("Events.answers"),
    getFormatter()
  ])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("counts", { ...view.counts, notAnswered: view.notAnswered.length })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {view.responses.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("member")}</TableHead>
                <TableHead>{t("answer")}</TableHead>
                <TableHead>{t("reason")}</TableHead>
                <TableHead>{t("comment")}</TableHead>
                <TableHead>{t("answeredAt")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.responses.map((response, index) => (
                // Erased Users have no id, so the row's place is the key.
                <TableRow key={response.userId ?? `erased-${index}`}>
                  <TableCell className="font-medium">{response.name ?? t("erased")}</TableCell>
                  <TableCell>{answers(response.answer)}</TableCell>
                  <TableCell className="whitespace-normal">{response.reasonLabel ?? response.reasonText}</TableCell>
                  <TableCell className="whitespace-normal">{response.comment}</TableCell>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-2">
                      <time dateTime={response.respondedAt.toISOString()}>
                        {format.dateTime(response.respondedAt, { dateStyle: "medium", timeStyle: "short" })}
                      </time>
                      {response.late ? <Badge variant="destructive">{t("late")}</Badge> : null}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t("notAnsweredTitle", { count: view.notAnswered.length })}</h3>
          {view.notAnswered.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("everyoneAnswered")}</p>
          ) : (
            <p className="text-sm">{format.list(view.notAnswered.map(({ name }) => name))}</p>
          )}
        </section>
      </CardContent>
    </Card>
  )
}
