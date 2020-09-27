This module defines a way of modifying documents that allows changes
to be recorded, replayed, and reordered. You can read more about
transformations in [the guide](/docs/guide/#transform).

@cn 这个模块定义了一种修改文档的方式，以允许修改被记录、回放、重新排序。你可以在
[中文指南](https://www.xheldon.com/prosemirror-guide-chinese.html) 的「transform」一节了解更多。

### Steps

Transforming happens in `Step`s, which are atomic, well-defined
modifications to a document. [Applying](#transform.Step.apply) a step
produces a new document.

@cn Transforming 发生在一个或者多个 `Step` 中，step 是原子的及定义良好的一个修改文档的类。
[Applying（应用）](#transform.Step.apply) 一个 step 会产生一个新的文档。

Each step provides a [change map](#transform.StepMap) that maps
positions in the old document to position in the transformed document.
Steps can be [inverted](#transform.Step.invert) to create a step that
undoes their effect, and chained together in a convenience object
called a [`Transform`](#transform.Transform).

@cn 每个 step 提供一个 [change map（修改映射）](#transform.StepMap)，它会在旧的文档和 transformed
后的文档之间映射。 Steps 可以被 [inverted（反转）](#transform.Step.invert) 以新建一个 step 来取消之前 step 所做的影响，
而且可以在一个叫做 [`Transform`](#transform.Transform) 的对象上方便的链式调用。

@Step
@StepResult
@ReplaceStep
@ReplaceAroundStep
@AddMarkStep
@RemoveMarkStep

### Position Mapping

Mapping positions from one document to another by running through the
[step maps](#transform.StepMap) produced by steps is an important
operation in ProseMirror. It is used, for example, for updating the
selection when the document changes.

@cn 通过调用由 step 产生的 [step maps](#transform.StepMap) 来从一个文档中映射位置到另一个文档中在 ProseMirror 中是一个非常重要的操作。
例如，它被用来当文档改变的时候更新选区。

@Mappable
@MapResult
@StepMap
@Mapping

### Document transforms

Because you often need to collect a number of steps together to effect
a composite change, ProseMirror provides an abstraction to make this
easy. [State transactions](#state.Transaction) are a subclass of
transforms.

@cn 由于你可能经常需要通过将一系列的 steps 合并到一起来修改文档，ProseMirror 提供了一个抽象来使这个过程简单化。
[State transactions](#state.Transaction) 就是这个抽象，它是 transforms 的子类。

@comment transaction 通常被简写为 tr。

@Transform

The following helper functions can be useful when creating
transformations or determining whether they are even possible.

@cn 当新建一个 transform 或者决定能否新建一个 transform 的时候，下面几个工具函数非常有用。

@replaceStep
@liftTarget
@findWrapping
@canSplit
@canJoin
@joinPoint
@insertPoint
@dropPoint
