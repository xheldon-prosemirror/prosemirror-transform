/// There are several things that positions can be mapped through.
/// Such objects conform to this interface.
///
/// @cn 位置可以被好几个对象 map，这类对象都符合该接口。
export interface Mappable {
  /// Map a position through this object. When given, `assoc` (should
  /// be -1 or 1, defaults to 1) determines with which side the
  /// position is associated, which determines in which direction to
  /// move when a chunk of content is inserted at the mapped position.
  ///
  /// @cn 通过该对象 map 一个位置。如果给定该方法，则 `assoc`（应该是 -1 或者 1，默认是 1）
  /// 决定位置与哪一侧有关，这决定了当一块内容被插入到被 map 的位置的时候，该位置应该往哪个方向移动。
  map: (pos: number, assoc?: number) => number

  /// Map a position, and return an object containing additional
  /// information about the mapping. The result's `deleted` field tells
  /// you whether the position was deleted (completely enclosed in a
  /// replaced range) during the mapping. When content on only one side
  /// is deleted, the position itself is only considered deleted when
  /// `assoc` points in the direction of the deleted content.
  ///
  /// @cn map 一个位置，然后返回一个包含关于这个 mapping 附加信息的对象。结果的 `deleted` 字段会告诉你该位置在 map 期间是否被删除（在一个 replace 的
  /// range 中完全闭合的位置，即两侧都删除），如果只有一侧被删除，则只有当 `assoc` 指向删除一侧的时候，这个位置才会被认为是删除了。
  mapResult: (pos: number, assoc?: number) => MapResult
}

// Recovery values encode a range index and an offset. They are
// represented as numbers, because tons of them will be created when
// mapping, for example, a large number of decorations. The number's
// lower 16 bits provide the index, the remaining bits the offset.
//
// @cn 恢复的值会将 range 的索引和偏移量进行编码。因为当 mapping 的时候他们会被大量的新建，因此为了方便将其表现为数字形式。
// 例如，大量的 decorations。编码后的数字中低于 16 位的部分是索引值，其余的位表示偏移量。
//
// @comment 目前没搞明白这句中「恢复的值」指的是什么。
//
// Note: We intentionally don't use bit shift operators to en- and
// decode these, since those clip to 32 bits, which we might in rare
// cases want to overflow. A 64-bit float can represent 48-bit
// integers precisely.
//
// @cn 记住：我们估计不使用位移运算符来对它们进行编码及解码，因为它们会被裁剪为 32 位，而在一些极端情况下我们希望能够溢出。
// 64 位浮点数能够精确表示 48 位整数。

const lower16 = 0xffff
const factor16 = Math.pow(2, 16)

function makeRecover(index: number, offset: number) { return index + offset * factor16 }
function recoverIndex(value: number) { return value & lower16 }
function recoverOffset(value: number) { return (value - (value & lower16)) / factor16 }

const DEL_BEFORE = 1, DEL_AFTER = 2, DEL_ACROSS = 4, DEL_SIDE = 8

/// An object representing a mapped position with extra
/// information.
///
/// @cn 一个带有额外信息的表示一个 map 过的位置的对象。
export class MapResult {
  /// @internal
  constructor(
    /// The mapped version of the position.
    ///
    /// @cn 被 map 过的位置。
    readonly pos: number,
    /// @internal
    readonly delInfo: number,
    /// @internal
    readonly recover: number | null
  ) {}

  /// Tells you whether the position was deleted, that is, whether the
  /// step removed the token on the side queried (via the `assoc`)
  /// argument from the document.
  ///
  /// @cn 告诉你该位置是否被删除了，也就是说，是否有 step 从文档中将该位置两侧（周围）的内容删除了。
  get deleted() { return (this.delInfo & DEL_SIDE) > 0 }

  /// Tells you whether the token before the mapped position was deleted.
  ///
  /// @cn 告诉你该位置前一个 token 是否被删除了。
  get deletedBefore() { return (this.delInfo & (DEL_BEFORE | DEL_ACROSS)) > 0 }

  /// True when the token after the mapped position was deleted.
  ///
  /// @cn 告诉你该位置后一个 token 是否被删除了。
  get deletedAfter() { return (this.delInfo & (DEL_AFTER | DEL_ACROSS)) > 0 }

  /// Tells whether any of the steps mapped through deletes across the
  /// position (including both the token before and after the
  /// position).
  ///
  /// @cn 告诉你该位置前后的 token 是否被删除了。
  get deletedAcross() { return (this.delInfo & DEL_ACROSS) > 0 }
}

/// A map describing the deletions and insertions made by a step, which
/// can be used to find the correspondence between positions in the
/// pre-step version of a document and the same position in the
/// post-step version.
///
/// @cn 一个 map 描述了由 step 产生的删除和插入操作，这可以用来找到应用 step 之前文档的位置和应用 step 之后文档的相同位置之间的对应关系。
export class StepMap implements Mappable {
  /// Create a position map. The modifications to the document are
  /// represented as an array of numbers, in which each group of three
  /// represents a modified chunk as `[start, oldSize, newSize]`.
  ///
  /// @cn 新建一个位置 map。对文档的修改被表示为一个数字数组，在数组中每三个值表示一个修改区域，即 `[开始，旧大小，新大小]`。
  constructor(
    /// @internal
    readonly ranges: readonly number[],
    /// @internal
    readonly inverted = false
  ) {
    if (!ranges.length && StepMap.empty) return StepMap.empty
  }

  /// @internal
  recover(value: number) {
    let diff = 0, index = recoverIndex(value)
    if (!this.inverted) for (let i = 0; i < index; i++)
      diff += this.ranges[i * 3 + 2] - this.ranges[i * 3 + 1]
    return this.ranges[index * 3] + diff + recoverOffset(value)
  }

  mapResult(pos: number, assoc = 1): MapResult { return this._map(pos, assoc, false) as MapResult }

  map(pos: number, assoc = 1): number { return this._map(pos, assoc, true) as number }

  /// @internal
  _map(pos: number, assoc: number, simple: boolean) {
    let diff = 0, oldIndex = this.inverted ? 2 : 1, newIndex = this.inverted ? 1 : 2
    for (let i = 0; i < this.ranges.length; i += 3) {
      let start = this.ranges[i] - (this.inverted ? diff : 0)
      if (start > pos) break
      let oldSize = this.ranges[i + oldIndex], newSize = this.ranges[i + newIndex], end = start + oldSize
      if (pos <= end) {
        let side = !oldSize ? assoc : pos == start ? -1 : pos == end ? 1 : assoc
        let result = start + diff + (side < 0 ? 0 : newSize)
        if (simple) return result
        let recover = pos == (assoc < 0 ? start : end) ? null : makeRecover(i / 3, pos - start)
        let del = pos == start ? DEL_AFTER : pos == end ? DEL_BEFORE : DEL_ACROSS
        if (assoc < 0 ? pos != start : pos != end) del |= DEL_SIDE
        return new MapResult(result, del, recover)
      }
      diff += newSize - oldSize
    }
    return simple ? pos + diff : new MapResult(pos + diff, 0, null)
  }

  /// @internal
  touches(pos: number, recover: number) {
    let diff = 0, index = recoverIndex(recover)
    let oldIndex = this.inverted ? 2 : 1, newIndex = this.inverted ? 1 : 2
    for (let i = 0; i < this.ranges.length; i += 3) {
      let start = this.ranges[i] - (this.inverted ? diff : 0)
      if (start > pos) break
      let oldSize = this.ranges[i + oldIndex], end = start + oldSize
      if (pos <= end && i == index * 3) return true
      diff += this.ranges[i + newIndex] - oldSize
    }
    return false
  }

  /// Calls the given function on each of the changed ranges included in
  /// this map.
  ///
  /// @cn 对该 map 中的每一个修改的 range 调用给定的函数。
  forEach(f: (oldStart: number, oldEnd: number, newStart: number, newEnd: number) => void) {
    let oldIndex = this.inverted ? 2 : 1, newIndex = this.inverted ? 1 : 2
    for (let i = 0, diff = 0; i < this.ranges.length; i += 3) {
      let start = this.ranges[i], oldStart = start - (this.inverted ? diff : 0), newStart = start + (this.inverted ? 0 : diff)
      let oldSize = this.ranges[i + oldIndex], newSize = this.ranges[i + newIndex]
      f(oldStart, oldStart + oldSize, newStart, newStart + newSize)
      diff += newSize - oldSize
    }
  }

  /// Create an inverted version of this map. The result can be used to
  /// map positions in the post-step document to the pre-step document.
  ///
  /// @cn 新建一个该 map 的反转版本。函数返回的结果可以被用来将 step 修改后的文档位置 map 回 step 修改前的文档位置。
  invert() {
    return new StepMap(this.ranges, !this.inverted)
  }

  /// @internal
  toString() {
    return (this.inverted ? "-" : "") + JSON.stringify(this.ranges)
  }

  /// Create a map that moves all positions by offset `n` (which may be
  /// negative). This can be useful when applying steps meant for a
  /// sub-document to a larger document, or vice-versa.
    //
  // @cn 新建一个将所有位置偏移 `n` （n 可能为负数）的一个 map。当将一个子文档的 step 应用于一个较大文档的时候，这可能会很有用，反之亦然。
  static offset(n: number) {
    return n == 0 ? StepMap.empty : new StepMap(n < 0 ? [0, -n, 0] : [0, 0, n])
  }

  /// A StepMap that contains no changed ranges.
  ///
  /// @cn 一个不包含任何修改 range 的 StepMap。
  static empty = new StepMap([])
}

/// A mapping represents a pipeline of zero or more [step
/// maps](#transform.StepMap). It has special provisions for losslessly
/// handling mapping positions through a series of steps in which some
/// steps are inverted versions of earlier steps. (This comes up when
/// ‘[rebasing](/docs/guide/#transform.rebasing)’ steps for
/// collaboration or history management.)
///
/// @cn 一个 mapping 表示 0 个或者更多个 [step maps](#transform.StepMap) 的管道。为了能够无损的处理通过一系列 step 而产生的位置 mapping，
/// 其中一些 steps 很有可能是之前 step 的反转版本（这可能出现在为了协同编辑或者历史管理而 ‘[rebasing](/docs/guide/#transform.rebasing)’ step 的时候）因此有一些特殊的规定需要遵守。
export class Mapping implements Mappable {
  /// Create a new mapping with the given position maps.
  ///
  /// @cn 用给定的位置 maps 新建一个 mapping。
  constructor(
    /// The step maps in this mapping.
    ///
    /// @cn 在当前 mapping 中的 step maps。
    readonly maps: StepMap[] = [],
    /// @internal
    public mirror?: number[],
    /// The starting position in the `maps` array, used when `map` or
    /// `mapResult` is called.
    ///
    /// @cn 在 `maps` 数组中的起始位置，当 `map` 或者 `mapResult` 调用的时候会被使用。
    public from = 0,
    /// The end position in the `maps` array.
    ///
    /// @cn `maps` 位置的结束位置。
    public to = maps.length
  ) {}

  /// Create a mapping that maps only through a part of this one.
  ///
  /// @cn 新建一个 mapping，其只 map 当前 mapping 的一部分。
  slice(from = 0, to = this.maps.length) {
    return new Mapping(this.maps, this.mirror, from, to)
  }

  /// @internal
  copy() {
    return new Mapping(this.maps.slice(), this.mirror && this.mirror.slice(), this.from, this.to)
  }

  /// Add a step map to the end of this mapping. If `mirrors` is
  /// given, it should be the index of the step map that is the mirror
  /// image of this one.
  ///
  /// @cn 添加一个 step map 到当前 mapping 的末尾。如果设置了 `mirrors` 参数，则它应该是 step map 的索引，即第一个参数 step map 的镜像。
  appendMap(map: StepMap, mirrors?: number) {
    this.to = this.maps.push(map)
    if (mirrors != null) this.setMirror(this.maps.length - 1, mirrors)
  }

  /// Add all the step maps in a given mapping to this one (preserving
  /// mirroring information).
  ///
  /// @cn 将给定 mapping 的所有 maps 添加到当前 mapping（保留镜像信息）。
  appendMapping(mapping: Mapping) {
    for (let i = 0, startSize = this.maps.length; i < mapping.maps.length; i++) {
      let mirr = mapping.getMirror(i)
      this.appendMap(mapping.maps[i], mirr != null && mirr < i ? startSize + mirr : undefined)
    }
  }

  /// Finds the offset of the step map that mirrors the map at the
  /// given offset, in this mapping (as per the second argument to
  /// `appendMap`).
  ///
  /// @cn 寻找给定偏移量位置的 map 的镜像 step map 的偏移量。
  getMirror(n: number): number | undefined {
    if (this.mirror) for (let i = 0; i < this.mirror.length; i++)
      if (this.mirror[i] == n) return this.mirror[i + (i % 2 ? -1 : 1)]
  }

  /// @internal
  setMirror(n: number, m: number) {
    if (!this.mirror) this.mirror = []
    this.mirror.push(n, m)
  }

  /// Append the inverse of the given mapping to this one.
  ///
  /// @cn 将给定 mapping 的相反顺序的 mapping 附加到当前 mapping 上。
  appendMappingInverted(mapping: Mapping) {
    for (let i = mapping.maps.length - 1, totalSize = this.maps.length + mapping.maps.length; i >= 0; i--) {
      let mirr = mapping.getMirror(i)
      this.appendMap(mapping.maps[i].invert(), mirr != null && mirr > i ? totalSize - mirr - 1 : undefined)
    }
  }

  /// Create an inverted version of this mapping.
  ///
  /// @cn 新建一个当前 mapping 包含相反 map 顺序的版本。
  invert() {
    let inverse = new Mapping
    inverse.appendMappingInverted(this)
    return inverse
  }

  /// Map a position through this mapping.
  ///
  /// @cn 通过该 mapping map 一个位置。
  ///
  /// @comment 该方法较为常用。
  map(pos: number, assoc = 1) {
    if (this.mirror) return this._map(pos, assoc, true) as number
    for (let i = this.from; i < this.to; i++)
      pos = this.maps[i].map(pos, assoc)
    return pos
  }

  /// Map a position through this mapping, returning a mapping
  /// result.
  ///
  /// @cn 通过该 mapping map 一个位置，返回一个 mapping 结果。
  mapResult(pos: number, assoc = 1) { return this._map(pos, assoc, false) as MapResult }

  /// @internal
  _map(pos: number, assoc: number, simple: boolean) {
    let delInfo = 0

    for (let i = this.from; i < this.to; i++) {
      let map = this.maps[i], result = map.mapResult(pos, assoc)
      if (result.recover != null) {
        let corr = this.getMirror(i)
        if (corr != null && corr > i && corr < this.to) {
          i = corr
          pos = this.maps[corr].recover(result.recover)
          continue
        }
      }

      delInfo |= result.delInfo
      pos = result.pos
    }

    return simple ? pos : new MapResult(pos, delInfo, null)
  }
}
