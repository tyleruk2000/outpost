import type { ProjectionResponse } from "@outpost/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { ErrorState } from "@/components/page";
import { kindMeta } from "@/components/search-hit";
import { formatNumber, plural } from "@/lib/utils";
import { COLOR, passageWhere } from "../charts/colors";
import { Figure, FigureInvitation, FigureSkeleton, FromTrace, Prose } from "../charts/figure";
import { useTraceState } from "../data";
import { AngleFigure } from "../figures/angle";
import { mapReading, VectorMap } from "../figures/map";
import { RankedBars } from "../figures/ranked";
import { stripsReading, VectorStrips } from "../figures/strips";
import { Stage, VectorNotice } from "../stages";

export function MeaningSection({ projection }: { projection: UseQueryResult<ProjectionResponse> }) {
  const { trace, query, overview, empty } = useTraceState();
  const data = query ? trace.data : undefined;
  const source = data?.semantic ?? overview?.vectors;
  const demonstration = source?.source === "demonstration" || source?.modelId === "demo:word-counts";
  const dimensions = source?.dimensions ?? null;

  return (
    <Stage id="stage-meaning">
      <VectorNotice source={source} className="mb-6 max-w-[46rem]" />
      <Prose>
        <p>
          The second search does not look at your words at all. It looks at what they mean, or as near to that as arithmetic can get. The
          trick is to turn every piece of text into a list of numbers, in such a way that texts about the same thing get similar lists.
        </p>
        <p>
          The program that does this is called an <strong>embedding model</strong>, and the list it produces is an{" "}
          <strong>embedding</strong>, or <strong>vector</strong>. The list is always the same length: a few hundred to a few thousand
          numbers, depending on the model. Each position in the list is called a <strong>dimension</strong>.{" "}
          {dimensions ? `The vectors in use here have ${formatNumber(dimensions)} dimensions.` : ""}
        </p>
        <p>
          An embedding model is not the kind of model that writes. It is far smaller, it only reads, and its whole output is that list. It
          learned to produce useful lists by being shown enormous amounts of text and adjusted, over and over, until sentences that mean
          similar things came out close together and unrelated ones came out far apart. Nobody chose what each dimension stands for, and no
          single one has a meaning you could name. Only the list as a whole carries meaning.
        </p>
        <h3>A vector is a direction</h3>
        <p>
          A list of two numbers can be drawn as an arrow on a page: so far across, so far up. A list of three is an arrow in a room. A list
          of several hundred is an arrow in a space nobody can picture, but the arithmetic is exactly the same, and so is the idea: every
          text becomes an arrow pointing somewhere, and texts with similar meaning point in similar directions.
        </p>
        <p>
          How similar is measured by the angle between two arrows. To get a single number, we take the cosine of that angle, which is called
          the <strong>cosine similarity</strong>. It is 1 when the arrows point the same way, 0 when they are at right angles, and −1 when
          they point in opposite directions. The length of the arrows does not matter, only the direction. Try it.
        </p>
      </Prose>

      <Figure
        id="fig-angle"
        title="Cosine similarity is a number for an angle"
        reading="Drag the violet arrow, or use the slider, and watch the number change."
      >
        <AngleFigure />
      </Figure>

      <Prose>
        <p>
          Searching by meaning is now easy to state. Beforehand, every passage is turned into a vector and stored. When you ask a question,
          it is turned into a vector by the same model. The question’s vector is compared with each passage’s vector, and the passages with
          the highest cosine similarity win. They are called the question’s <strong>nearest neighbours</strong>.
        </p>
        {demonstration ? (
          <>
            <h3>How the demonstration vectors are made</h3>
            <p>
              The vectors on this page are simpler than a real model’s, and you can follow exactly how they are built. Common words such as
              “the” and “how” are thrown away, and endings are trimmed. Every remaining word is given a fixed position among the{" "}
              {formatNumber(dimensions ?? 256)} by a hash, which is a repeatable scramble of its letters. A text’s vector has, at each of
              its words’ positions, a number that grows with how often the word appears. Half the words count as negative, so that two
              unrelated words landing on the same position tend to cancel. Everything else is zero. There are far more words than positions,
              so different words do sometimes share one, and now and then a passage scores a little for a word it does not contain.
            </p>
            {data && data.semantic.queryTerms.length > 0 ? (
              <p>
                Your question’s vector is built from {plural(data.semantic.queryTerms.length, "word")}:{" "}
                {data.semantic.queryTerms.map((term) => `“${term}”`).join(", ")}. So it has at most{" "}
                {plural(data.semantic.queryTerms.length, "number")} that are not zero, out of {formatNumber(dimensions ?? 256)}.
              </p>
            ) : null}
            <p>
              Two texts that share words therefore point in similar directions, and two that share none are at right angles. That is honest
              arithmetic, but it is word matching by another route. A real embedding model fills every position with a small number and
              places “purify the stream water” near “boil before drinking” although they share no word at all.
            </p>
          </>
        ) : null}
      </Prose>

      <Figure id="fig-strips" title="The numbers themselves" reading={data ? stripsReading(data) : undefined}>
        <FromTrace
          shape="strip"
          invitation="A row of small bars for your question’s vector, and a row beneath it for each of the closest passages, lined up position by position."
        >
          {(traced) => <VectorStrips trace={traced} />}
        </FromTrace>
        {data ? (
          <p className="mt-3 max-w-[68ch] text-small text-ink-muted">
            A bar above the line is a positive number and a bar below it is a negative one. Each row is drawn to its own scale, because
            direction is what counts, not size. To get the cosine, multiply the two vectors position by position and add up the results: a
            position adds to the similarity only where both rows have a bar on the same side of the line. Those positions are dotted.
          </p>
        ) : null}
      </Figure>

      <Figure
        id="fig-meaning-results"
        title="What search by meaning found, in order"
        reading={
          data
            ? data.semantic.hits.length > 0
              ? `The closest passage has a cosine similarity of ${data.semantic.hits[0]!.similarity.toFixed(2)} with your question; the last one shown, ${data.semantic.hits[data.semantic.hits.length - 1]!.similarity.toFixed(2)}. ${demonstration ? "A passage that shares no word with the question scores 0 and is left out." : "Nothing is ever “not found” by this search: every passage gets a number, and the list is simply cut off."}`
              : "No passage’s vector points anywhere near your question’s."
            : undefined
        }
      >
        <FromTrace shape="bars" invitation="A ranked list of passages, each with a bar for its cosine similarity to your question.">
          {(traced) =>
            traced.semantic.hits.length > 0 ? (
              <RankedBars
                color={COLOR.meaning}
                measure="Cosine similarity"
                max={1}
                caption="Results of search by meaning in rank order"
                axis="Bar length is cosine similarity, from 0 (unrelated) to 1 (pointing the same way)."
                rows={traced.semantic.hits.map((hit) => ({
                  chunkId: hit.chunkId,
                  rank: hit.rank,
                  title: hit.title,
                  where: [hit.kind !== "document" ? (kindMeta[hit.kind]?.label ?? hit.kind) : null, passageWhere(hit)]
                    .filter(Boolean)
                    .join(", "),
                  url: hit.url,
                  segments: hit.segments,
                  value: hit.similarity,
                  valueText: hit.similarity.toFixed(2),
                  length: hit.length,
                }))}
              />
            ) : (
              <p className="text-small text-ink-muted">
                {demonstration
                  ? "None of your question’s words appears in any passage, so every demonstration vector is at right angles to it. A real model would still rank the passages by meaning."
                  : "The index returned no passages for this question."}
              </p>
            )
          }
        </FromTrace>
      </Figure>

      <Prose>
        <h3>Checking every vector</h3>
        <p>
          {data
            ? `To produce that list, your question’s vector was compared with ${plural(data.semantic.compared, "vector")}, one after another.`
            : "To produce a list like that, the question’s vector is compared with every stored vector, one after another."}{" "}
          That is called an <em>exact</em> search: it is certain to find the true nearest neighbours, because it looks at all of them. Each
          comparison is a few hundred multiplications, which a small computer does millions of times a second, so a library of a hundred
          thousand passages is still searched in well under a second.
        </p>
        <p>
          Systems holding hundreds of millions of vectors cannot afford to look at every one. They use an <em>approximate</em> index, which
          arranges the vectors in advance so that most can be skipped. It is much faster and uses more memory, and it will now and then miss
          a true neighbour. Outpost does not need one at the size of a personal library, so it does not make that trade.
        </p>
        <h3>A map, with a warning</h3>
        <p>
          It would be useful to see all the passages laid out by meaning. Their vectors have far too many dimensions to draw, so the next
          figure flattens them to two. It finds the direction along which the vectors differ most and uses it as the horizontal axis, then
          the next most different direction for the vertical one. (The method is called principal component analysis.) Passages about the
          same subject tend to land near each other.
        </p>
      </Prose>

      <Figure
        id="fig-map"
        title="A map of the passages, flattened to two dimensions"
        reading={projection.data && !empty ? mapReading(projection.data) : undefined}
      >
        {empty ? (
          <FigureInvitation shape="scatter" empty>
            A mark for each passage, placed so that similar vectors are close together.
          </FigureInvitation>
        ) : projection.isError && !projection.isFetching ? (
          <ErrorState error={projection.error} onRetry={() => void projection.refetch()} />
        ) : !projection.data ? (
          <FigureSkeleton shape="scatter" />
        ) : projection.data.points.length === 0 ? (
          <p className="text-small text-ink-muted">There are no vectors to draw yet.</p>
        ) : (
          <div className={projection.isPlaceholderData ? "opacity-50 transition-opacity" : "transition-opacity"}>
            <VectorMap data={projection.data} />
          </div>
        )}
      </Figure>

      <Prose>
        <p>
          Read the map as a sketch and no more. Flattening throws away most of what the vectors say, and the figure states how much. Two
          marks that sit side by side may be far apart in the dimensions that were dropped, which is why a ringed passage is sometimes not
          the one drawn closest to your question. The rings are decided by the real cosine similarity, worked out in every dimension; the
          positions are only the best two-dimensional likeness.
        </p>
        <p>
          The strength of search by meaning is the weakness of keyword search turned round: it can find a passage that uses none of your
          words. Its own weakness is the reverse too. It is vague about exact terms. Ask for a part number, a surname or an unusual
          abbreviation and a vector may well prefer passages that are merely on the same subject. Each search covers for the other, which is
          the reason to run both.
        </p>
      </Prose>
    </Stage>
  );
}
